#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

# ============================================================================
# XreyStudioServer — добавление ноды Xray по SSH.
#
# Порядок работы:
#   1. проверка аргументов и доступности хоста по SSH;
#   2. получение NODE_ID/AGENT_TOKEN (готовые или созданные через API панели);
#   3. установка агента на удалённом хосте (install.sh --mode node);
#   4. регистрация ноды: POST /api/nodes/register;
#   5. проверка статуса ONLINE (GET /api/nodes/:id/health).
#
# Примеры:
#   # посмотреть план, ничего не меняя
#   ./scripts/add-node.sh --host 203.0.113.10 \
#     --panel-url https://panel.example.com --admin-token "$PANEL_ADMIN_TOKEN" --dry-run
#
#   # реальная установка: нода создаётся в панели и ставится на хост
#   ./scripts/add-node.sh --host 203.0.113.10 --user root \
#     --panel-url https://panel.example.com --admin-token "$PANEL_ADMIN_TOKEN"
#
#   # нода уже создана в панели вручную
#   ./scripts/add-node.sh --host 203.0.113.10 --panel-url https://panel.example.com \
#     --node-id 6f1c… --token "$AGENT_TOKEN"
#
# Требования: bash, ssh (ключ или ssh-agent, вход без пароля), curl, а также
# jq или python3 (разбор JSON-ответов панели); на удалённом хосте — git,
# docker + docker compose v2.
# ============================================================================
set -euo pipefail

PROG_NAME="$(basename "${BASH_SOURCE[0]:-$0}")"

HOST=""
SSH_USER="root"
SSH_PORT="22"
SSH_HOST_KEY="accept-new"
TOKEN=""
NODE_ID=""
PANEL_URL=""
NAME=""
ADMIN_TOKEN="${PANEL_ADMIN_TOKEN:-}"
REMOTE_DIR="/opt/xrey"
REPO_URL="https://github.com/HakunaMaruna/XreyStudioServer.git"
WAIT_SECONDS="60"
DRY_RUN=0

# ---------- вывод ----------
die() { printf '%s: ошибка: %s\n' "$PROG_NAME" "$*" >&2; exit 1; }
info() { printf '\033[36m▸\033[0m %s\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
Добавление ноды XreyStudioServer по SSH.

Использование:
  add-node.sh --host <host> --panel-url <url> [параметры]

Обязательные:
  --host <host>             адрес ноды (IP или DNS-имя)
  --panel-url <url>         URL панели, например https://panel.example.com

Идентификация ноды (одно из двух):
  --node-id <id> --token <t>  нода уже создана в панели: её id и AGENT_TOKEN
  --admin-token <jwt>         JWT администратора панели — нода будет создана
                              через POST /api/nodes (или переменная
                              окружения PANEL_ADMIN_TOKEN)

Необязательные:
  --user <user>             SSH-пользователь (по умолчанию root)
  --ssh-port <port>         SSH-порт (по умолчанию 22)
  --name <name>             имя ноды в панели (по умолчанию node-<host>)
  --dir <path>              каталог установки на ноде (по умолчанию /opt/xrey)
  --repo <url>              git-репозиторий (по умолчанию GitHub main)
  --wait <sec>              сколько ждать статуса ONLINE (по умолчанию 60)
  --dry-run                 ничего не менять, только напечатать команды
  -h, --help                эта справка

Коды возврата:
  0 — нода установлена и ONLINE
  1 — ошибка аргументов, SSH или API
  2 — агент установлен, но статус ONLINE не подтверждён
USAGE
}

# ---------- разбор аргументов ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --host) [ $# -ge 2 ] || die "--host требует значения"; HOST="$2"; shift 2 ;;
    --user) [ $# -ge 2 ] || die "--user требует значения"; SSH_USER="$2"; shift 2 ;;
    --ssh-port) [ $# -ge 2 ] || die "--ssh-port требует значения"; SSH_PORT="$2"; shift 2 ;;
    --token) [ $# -ge 2 ] || die "--token требует значения"; TOKEN="$2"; shift 2 ;;
    --node-id) [ $# -ge 2 ] || die "--node-id требует значения"; NODE_ID="$2"; shift 2 ;;
    --panel-url) [ $# -ge 2 ] || die "--panel-url требует значения"; PANEL_URL="$2"; shift 2 ;;
    --admin-token) [ $# -ge 2 ] || die "--admin-token требует значения"; ADMIN_TOKEN="$2"; shift 2 ;;
    --name) [ $# -ge 2 ] || die "--name требует значения"; NAME="$2"; shift 2 ;;
    --dir) [ $# -ge 2 ] || die "--dir требует значения"; REMOTE_DIR="$2"; shift 2 ;;
    --repo) [ $# -ge 2 ] || die "--repo требует значения"; REPO_URL="$2"; shift 2 ;;
    --wait) [ $# -ge 2 ] || die "--wait требует значения"; WAIT_SECONDS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "неизвестный параметр: $1 (см. --help)" ;;
  esac
done

# ---------- валидация ----------
valid_host() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'; }
valid_user() { printf '%s' "$1" | grep -Eq '^[A-Za-z_][A-Za-z0-9._-]*$'; }
valid_port() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
valid_url()  { printf '%s' "$1" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'; }
valid_token() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._:-]{16,4096}$'; }
valid_node_id() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'; }
valid_name() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,63}$'; }
valid_path() { printf '%s' "$1" | grep -Eq '^/[A-Za-z0-9._/-]+$'; }

[ -n "$HOST" ] || die "не указан --host"
valid_host "$HOST" || die "--host содержит недопустимые символы: $HOST"
valid_user "$SSH_USER" || die "--user содержит недопустимые символы: $SSH_USER"
valid_port "$SSH_PORT" || die "--ssh-port должен быть числом 1..65535"
[ -n "$PANEL_URL" ] || die "не указан --panel-url"
valid_url "$PANEL_URL" || die "--panel-url должен начинаться с http:// или https:// и не содержать пробелов"
PANEL_URL="${PANEL_URL%/}"
NAME="${NAME:-node-$HOST}"
valid_name "$NAME" || die "--name содержит недопустимые символы"
valid_path "$REMOTE_DIR" || die "--dir должен быть абсолютным путём без пробелов"
case "$WAIT_SECONDS" in ''|*[!0-9]*) die "--wait должен быть числом секунд" ;; esac
[ -z "$NODE_ID" ] || valid_node_id "$NODE_ID" || die "--node-id содержит недопустимые символы"
[ -z "$TOKEN" ] || valid_token "$TOKEN" || die "--token содержит недопустимые символы (ожидается hex/uuid)"
[ -z "$ADMIN_TOKEN" ] || valid_token "$ADMIN_TOKEN" || die "--admin-token содержит недопустимые символы"

if [ "$DRY_RUN" -eq 0 ]; then
  command -v ssh >/dev/null 2>&1 || die "не найден ssh"
  command -v curl >/dev/null 2>&1 || die "не найден curl"
  # Ответы панели разбираются jq или python3 (см. json_field); в dry-run разбора нет.
  command -v jq >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 \
    || die "нужен jq или python3 для разбора JSON-ответов панели"
else
  command -v ssh >/dev/null 2>&1 || warn "ssh не найден — это нормально для --dry-run"
  command -v curl >/dev/null 2>&1 || warn "curl не найден — это нормально для --dry-run"
fi

# ---------- вспомогательные команды ----------
SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking="$SSH_HOST_KEY" -o ConnectTimeout=10)

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

show_cmd() {
  # Печатаем команду без значений секретов.
  printf '  \033[33m[dry-run]\033[0m %s\n' "$1"
}

# Достаём значение поля из JSON-ответа панели: jq или python3 (проверены при старте).
# Возвращает пустую строку, если ключа нет или JSON не разобрался.
json_field() {
  local json="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg k "$key" '.[$k] // empty' 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c '
import json, sys
try:
    value = json.load(sys.stdin).get(sys.argv[1])
except Exception:
    sys.exit(0)
if value is None:
    sys.exit(0)
print("true" if value is True else "false" if value is False else value)
' "$key" 2>/dev/null || true
  fi
}

# ---------- создание ноды в панели ----------
create_node_in_panel() {
  local payload response
  payload="$(printf '{"name":"%s","address":"%s","port":443}' "$NAME" "$HOST")"
  response="$(curl -fsS -X POST "$PANEL_URL/api/nodes" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$payload")" || die "не удалось создать ноду: POST $PANEL_URL/api/nodes"
  NODE_ID="$(json_field "$response" id)"
  TOKEN="$(json_field "$response" agentToken)"
  [ -n "$NODE_ID" ] && [ -n "$TOKEN" ] || die "панель не вернула id/agentToken — проверьте права токена (нужен ADMIN/OPERATOR)"
  valid_node_id "$NODE_ID" || die "панель вернула неожиданный id ноды: $NODE_ID"
  ok "нода создана в панели: $NODE_ID"
}

info "Нода: $HOST (ssh $SSH_USER@$HOST:$SSH_PORT), панель: $PANEL_URL"

if [ -z "$NODE_ID" ] || [ -z "$TOKEN" ]; then
  if [ -n "$ADMIN_TOKEN" ]; then
    info "Создаю ноду в панели (POST /api/nodes)"
    if [ "$DRY_RUN" -eq 1 ]; then
      show_cmd "curl -X POST $PANEL_URL/api/nodes -H 'Authorization: Bearer ***' -d '{\"name\":\"$NAME\",\"address\":\"$HOST\",\"port\":443}'"
      NODE_ID="<id из ответа POST /api/nodes>"
      TOKEN="<agentToken из ответа POST /api/nodes>"
    else
      create_node_in_panel
    fi
  elif [ "$DRY_RUN" -eq 1 ]; then
    # В сухом режиме показываем пример значений, ничего не создавая.
    NODE_ID="${NODE_ID:-node-$(printf '%s' "$HOST" | tr -cd '[:alnum:]' | cut -c1-12)}"
    TOKEN="${TOKEN:-$(random_hex)}"
    warn "NODE_ID/AGENT_TOKEN сгенерированы только для примера: без --admin-token или готовой пары --node-id/--token регистрация не пройдёт"
  else
    die "нужны --node-id и --token от созданной ноды, либо --admin-token (или PANEL_ADMIN_TOKEN), чтобы создать ноду через API"
  fi
fi

# ---------- доступность хоста ----------
if [ "$DRY_RUN" -eq 1 ]; then
  show_cmd "ssh -p $SSH_PORT -o BatchMode=yes $SSH_USER@$HOST true"
else
  info "Проверяю SSH-доступ"
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" true 2>/dev/null \
    || die "SSH недоступен: $SSH_USER@$HOST:$SSH_PORT (нужен ключ/agent и BatchMode без пароля)"
  ok "SSH доступен"
fi

# ---------- установка агента на удалённом хосте ----------
# Скрипт передаётся на ноду через stdin, аргументы — позиционно:
# никакой подстановки локальных значений в текст скрипта не происходит.
read -r -d '' REMOTE_SCRIPT <<'REMOTE' || true
set -euo pipefail
DIR="$1"
REPO="$2"
PANEL_URL="$3"
NODE_ID="$4"
AGENT_TOKEN="$5"

export PANEL_URL NODE_ID AGENT_TOKEN

echo "== проверка зависимостей =="
command -v git >/dev/null 2>&1 || { echo "нужен git" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "нужен docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "нужен docker compose v2" >&2; exit 1; }

echo "== исходники =="
if [ ! -d "$DIR/.git" ]; then
  mkdir -p "$DIR"
  git clone --depth 1 "$REPO" "$DIR"
else
  git -C "$DIR" fetch --depth 1 origin main
  git -C "$DIR" pull --ff-only origin main
fi
cd "$DIR"

echo "== установка агента =="
# install.sh берёт AGENT_TOKEN/NODE_ID/PANEL_URL из окружения.
bash install.sh --mode node --domain "$PANEL_URL" --yes

echo "== проверка агента =="
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:9090/health >/dev/null 2>&1; then
    echo "agent /health отвечает"
    exit 0
  fi
  sleep 2
done
echo "агент не ответил на http://127.0.0.1:9090/health" >&2
exit 1
REMOTE

run_remote_install() {
  local display
  display="ssh -p $SSH_PORT $SSH_USER@$HOST bash -s -- $REMOTE_DIR $REPO_URL $PANEL_URL <node-id> "
  if [ "$DRY_RUN" -eq 1 ]; then
    show_cmd "$display ***"
    printf '%s\n' "$REMOTE_SCRIPT" | sed 's/^/    | /'
    return 0
  fi
  info "Ставлю агент на $HOST (каталог $REMOTE_DIR)"
  printf '%s\n' "$REMOTE_SCRIPT" | ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" bash -s -- \
    "$REMOTE_DIR" "$REPO_URL" "$PANEL_URL" "$NODE_ID" "$TOKEN"
}

run_remote_install || die "установка агента на $HOST завершилась ошибкой"

# ---------- регистрация ноды ----------
REGISTER_BODY="$(printf '{"nodeId":"%s","address":"%s"}' "$NODE_ID" "$HOST")"
register_node() {
  curl -fsS -X POST "$PANEL_URL/api/nodes/register" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$REGISTER_BODY"
}

if [ "$DRY_RUN" -eq 1 ]; then
  show_cmd "curl -X POST $PANEL_URL/api/nodes/register -H 'Authorization: Bearer ***' -d '$REGISTER_BODY'"
else
  info "Регистрирую ноду (POST /api/nodes/register)"
  REGISTER_RESPONSE="$(register_node)" || die "регистрация не удалась: проверьте NODE_ID/AGENT_TOKEN и доступность $PANEL_URL"
  REGISTER_STATUS="$(json_field "$REGISTER_RESPONSE" status)"
  case "$REGISTER_STATUS" in
    ONLINE) ok "панель подтвердила статус ONLINE" ;;
    *) warn "панель ответила без ONLINE: $REGISTER_RESPONSE" ;;
  esac
fi

# ---------- ожидание ONLINE ----------
node_online() {
  local body online status
  body="$(curl -fsS "$PANEL_URL/api/nodes/$NODE_ID/health" \
    -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null)" || return 1
  online="$(json_field "$body" online | tr '[:upper:]' '[:lower:]')"
  status="$(json_field "$body" status | tr '[:upper:]' '[:lower:]')"
  [ "$online" = "true" ] || [ "$status" = "online" ] || return 1
  return 0
}

if [ "$DRY_RUN" -eq 1 ]; then
  show_cmd "curl $PANEL_URL/api/nodes/$NODE_ID/health -H 'Authorization: Bearer ***'  # ждём online=true"
  printf '\n%s\n' "Итог dry-run: изменения не вносились."
  exit 0
fi

if [ -n "$ADMIN_TOKEN" ]; then
  info "Жду статус ONLINE (до $WAIT_SECONDS c)"
  elapsed=0
  until node_online; do
    if [ "$elapsed" -ge "$WAIT_SECONDS" ]; then
      warn "нода не подтвердила ONLINE за $WAIT_SECONDS c — смотрите /api/nodes/$NODE_ID/health и docker logs agent"
      exit 2
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  ok "нода ONLINE"
else
  warn "--admin-token не задан: пропускаю опрос GET /api/nodes/:id/health, статус подтверждён только ответом регистрации"
fi

printf '\n%s\n' "Готово: нода $NODE_ID ($HOST) подключена к $PANEL_URL"
printf '%s\n' "AGENT_TOKEN (сохраните, больше не показывается): $TOKEN"
