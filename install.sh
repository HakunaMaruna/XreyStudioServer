#!/usr/bin/env bash
# XreyStudioServer — one-command installer with a multilingual terminal menu.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/HakunaMaruna/XreyStudioServer/main/install.sh | bash
#   ./install.sh [--mode all-in-one|panel|node|subscription|control] [--domain example.com] [--lang en|ru] [--yes] [--dry-run]
set -euo pipefail

MODE=""
DOMAIN=""
LANG_CODE=""
YES=0
DRY_RUN=0
# Онбординг ноды по SSH (issue #95): без этих флагов поведение прежнее.
SSH_HOST=""
SSH_USER=""
SSH_PORT="22"
# Запоминаем, задал ли пользователь NODE_ID явно: ниже он получает значение
# по умолчанию, и в SSH-ветку нельзя передавать эту заглушку.
NODE_ID_EXPLICIT="${NODE_ID:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --lang|--language) LANG_CODE="${2:-}"; shift 2 ;;
    --yes|-y) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --ssh-host) [ $# -ge 2 ] || { echo "--ssh-host requires a value" >&2; exit 1; }; SSH_HOST="$2"; shift 2 ;;
    --ssh-user) [ $# -ge 2 ] || { echo "--ssh-user requires a value" >&2; exit 1; }; SSH_USER="$2"; shift 2 ;;
    --ssh-port) [ $# -ge 2 ] || { echo "--ssh-port requires a value" >&2; exit 1; }; SSH_PORT="$2"; shift 2 ;;
    -h|--help)
      cat <<'HELP'
XreyStudioServer installer

Usage:
  ./install.sh [options]

Options:
  --mode all-in-one|panel|node|subscription|control  Installation mode
  --domain example.com                        Panel domain
  --lang en|ru                                Installer language
  --yes, -y                                   Skip confirmations
  --dry-run                                   Print actions without executing
  --ssh-host HOST                             Node mode: install the agent on a
                                              remote host over SSH
  --ssh-user USER                             SSH user for --ssh-host (default: root)
  --ssh-port PORT                             SSH port for --ssh-host (default: 22)
  -h, --help                                  Show this help

One-line install:
  curl -fsSL https://raw.githubusercontent.com/HakunaMaruna/XreyStudioServer/main/install.sh | bash
HELP
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ---------- translations ----------
t() {
  local key="$1"
  case "$LANG_CODE" in
    ru)
      case "$key" in
        select_language) printf 'Выберите язык:' ;;
        english) printf 'English' ;;
        russian) printf 'Русский' ;;
        choice) printf 'Выбор [1]: ' ;;
        invalid_choice) printf 'Неверный выбор.' ;;
        select_mode) printf 'Выберите режим установки:' ;;
        all_in_one) printf 'Всё в одном — панель + фронтенд + агент + Caddy (рекомендуется)' ;;
        panel_only) printf 'Только панель — backend + Caddy' ;;
        node_agent) printf 'Агент ноды — подключить этот хост как ноду Xray' ;;
        subscription) printf 'Подписка — публичный фронтенд подписок + Caddy' ;;
        control) printf 'CONTROL — центральная панель + PowerDNS (зона нод)' ;;
        exit) printf 'Выход' ;;
        panel_url_prompt) printf 'URL панели (например https://msc.example.com)' ;;
        domain_prompt) printf 'Домен для панели' ;;
        summary) printf 'Сводка установки' ;;
        mode) printf 'Режим' ;;
        domain) printf 'Домен' ;;
        panel_url) printf 'URL панели' ;;
        node_id) printf 'ID ноды' ;;
        dry_run) printf 'Пробный запуск' ;;
        proceed) printf 'Продолжить установку?' ;;
        cancelled) printf 'Установка отменена.' ;;
        checking) printf 'Проверка зависимостей...' ;;
        git_required) printf 'Требуется git.' ;;
        docker_installing) printf 'Docker не найден — устанавливается...' ;;
        compose_required) printf 'Требуется Docker Compose v2.' ;;
        cloning) printf 'Клонирование репозитория в %s...' ;;
        repo_present) printf 'Репозиторий уже есть' ;;
        generating_env) printf 'Создание .env и секретов...' ;;
        env_present) printf '.env уже существует — секреты сохранены' ;;
        checking_dns) printf 'Проверка DNS...' ;;
        dns_fail) printf '! %s пока не резолвится — Let\x27s Encrypt не сработает, пока DNS не настроен' ;;
        dns_ok) printf '✓ %s резолвится' ;;
        dns_note) printf 'Нужны записи: %s и *.%s -> IP сервера, открытые порты 80/443' ;;
        starting) printf 'Запуск сервисов...' ;;
        complete) printf '✓ Установка завершена' ;;
        panel_label) printf 'Панель' ;;
        docs_label) printf 'Документация' ;;
        login_label) printf 'Логин' ;;
        password_label) printf 'Пароль' ;;
        secure_note) printf 'Сохраните эти данные в безопасном месте и смените пароль после первого входа.' ;;
        bye) printf 'До свидания.' ;;
        *) printf '%s' "$key" ;;
      esac
      ;;
    *)
      case "$key" in
        select_language) printf 'Select language:' ;;
        english) printf 'English' ;;
        russian) printf 'Русский' ;;
        choice) printf 'Choice [1]: ' ;;
        invalid_choice) printf 'Invalid choice.' ;;
        select_mode) printf 'Select installation mode:' ;;
        all_in_one) printf 'All-in-one — panel + frontend + agent + Caddy (recommended)' ;;
        panel_only) printf 'Panel only — backend + Caddy' ;;
        node_agent) printf 'Node agent — connect this host as an Xray node' ;;
        subscription) printf 'Subscription — public subscription frontend + Caddy' ;;
        control) printf 'CONTROL — central panel + PowerDNS (node zone)' ;;
        exit) printf 'Exit' ;;
        panel_url_prompt) printf 'Panel URL (e.g. https://msc.example.com)' ;;
        domain_prompt) printf 'Domain for the panel' ;;
        summary) printf 'Installation summary' ;;
        mode) printf 'Mode' ;;
        domain) printf 'Domain' ;;
        panel_url) printf 'Panel URL' ;;
        node_id) printf 'Node ID' ;;
        dry_run) printf 'Dry run' ;;
        proceed) printf 'Proceed with installation?' ;;
        cancelled) printf 'Installation cancelled.' ;;
        checking) printf 'Checking prerequisites...' ;;
        git_required) printf 'git is required.' ;;
        docker_installing) printf 'Docker not found — installing...' ;;
        compose_required) printf 'Docker Compose v2 is required.' ;;
        cloning) printf 'Cloning repository into %s...' ;;
        repo_present) printf 'Repository already present' ;;
        generating_env) printf 'Generating .env and secrets...' ;;
        env_present) printf '.env exists — keeping existing secrets' ;;
        checking_dns) printf 'Checking DNS...' ;;
        dns_fail) printf '! %s does not resolve yet — Let\x27s Encrypt will fail until DNS is set' ;;
        dns_ok) printf '✓ %s resolves' ;;
        dns_note) printf 'Required: %s and *.%s A/AAAA -> this server, ports 80/443 open' ;;
        starting) printf 'Starting services...' ;;
        complete) printf '✓ Installation complete' ;;
        panel_label) printf 'Panel' ;;
        docs_label) printf 'Docs' ;;
        login_label) printf 'Login' ;;
        password_label) printf 'Password' ;;
        secure_note) printf 'Store these credentials securely. Change the admin password after first login.' ;;
        bye) printf 'Bye.' ;;
        *) printf '%s' "$key" ;;
      esac
      ;;
  esac
}

# ---------- terminal styling ----------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
  C_RESET=$(tput sgr0); C_BOLD=$(tput bold); C_DIM=$(tput dim)
  C_BLUE=$(tput setaf 4); C_CYAN=$(tput setaf 6); C_GREEN=$(tput setaf 2)
  C_YELLOW=$(tput setaf 3); C_RED=$(tput setaf 1); C_WHITE=$(tput setaf 7)
else
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
  C_BLUE='\033[34m'; C_CYAN='\033[36m'; C_GREEN='\033[32m'
  C_YELLOW='\033[33m'; C_RED='\033[31m'; C_WHITE='\033[37m'
fi

say() { printf '%b\n' "$*"; }
line() { say "${C_DIM}────────────────────────────────────────────────────────${C_RESET}"; }

banner() {
  clear 2>/dev/null || true
  say ""
  say "${C_BLUE}╔══════════════════════════════════════════════════════════════╗${C_RESET}"
  say "${C_BLUE}║${C_RESET}                                                          ${C_BLUE}║${C_RESET}"
  say "${C_BLUE}║${C_RESET}  ${C_BOLD}${C_CYAN}X R E Y   S T U D I O   S E R V E R${C_RESET}                    ${C_BLUE}║${C_RESET}"
  say "${C_BLUE}║${C_RESET}  ${C_DIM}Self-hosted control panel for Xray-core${C_RESET}              ${C_BLUE}║${C_RESET}"
  say "${C_BLUE}║${C_RESET}                                                          ${C_BLUE}║${C_RESET}"
  say "${C_BLUE}╚══════════════════════════════════════════════════════════════╝${C_RESET}"
  say ""
}

read_language() {
  local choice=""
  if [ -t 0 ]; then IFS= read -r choice || true; fi
  case "${choice:-1}" in
    1) echo "en" ;;
    2) echo "ru" ;;
    *) say "  ${C_RED}$(t invalid_choice)${C_RESET}"; return 1 ;;
  esac
}

read_choice() {
  local choice=""
  if [ -t 0 ]; then IFS= read -r choice || true; fi
  case "${choice:-1}" in
    0) say "$(t bye)"; exit 0 ;;
    1) echo "all-in-one" ;;
    2) echo "panel" ;;
    3) echo "node" ;;
    4) echo "subscription" ;;
    5) echo "control" ;;
    *) say "  ${C_RED}$(t invalid_choice)${C_RESET}"; return 1 ;;
  esac
}

ask() {
  local prompt="$1" default="${2:-}" value=""
  # Prompts go to stderr: ask() is used inside $(...) and stdout must contain only the answer.
  if [ -n "$default" ]; then printf '%b [%s]: ' "$prompt" "$default" >&2; else printf '%b: ' "$prompt" >&2; fi
  if [ -t 0 ]; then IFS= read -r value || true; fi
  printf '%s\n' "${value:-$default}"
}

confirm() {
  [ "$YES" -eq 1 ] && return 0
  local answer
  printf '%b [y/N]: ' "$1" >&2
  if [ -t 0 ]; then IFS= read -r answer || true; fi
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then say "  ${C_YELLOW}[dry-run]${C_RESET} $*"; else "$@"; fi
}

run_sh() {
  if [ "$DRY_RUN" -eq 1 ]; then say "  ${C_YELLOW}[dry-run]${C_RESET} sh -c $1"; else sh -c "$1"; fi
}

# Агент получает только собственный env-файл: секреты панели (JWT_SECRET,
# POSTGRES_PASSWORD, STRIPE_*, MCP_*) в него не попадают. Список — белый.
AGENT_ENV_KEYS="PANEL_URL AGENT_TOKEN AGENT_SECRET NODE_ID NODE_ADDRESS PORT DECOY_HOST DECOY_PORT DECOY_HTTP_PORT DECOY_TLS_DIR ACME_WEBROOT WIZARD_DECOY_PORT
XRAY_MANAGED XRAY_CONFIG_PATH XRAY_BIN XRAY_SERVICE XRAY_STATS_ENABLED
XRAY_API_HOST XRAY_API_PORT TRAFFIC_REPORT_INTERVAL BACKUP_DIR GEOCHECK_URL
GEOCHECK_INTERVAL SINGBOX_CONFIG_PATH SINGBOX_BIN SINGBOX_SERVICE XRAY_LOG_PATH
SINGBOX_LOG_PATH AGENT_TLS_DIR AGENT_TLS_CERT AGENT_TLS_KEY AGENT_TLS_CA
NODE_DOMAIN_SUFFIX LE_EMAIL ACME_WEBROOT CERTS_DIR"

write_agent_env() {
  local target=".agent.env" key line
  if [ "$DRY_RUN" -eq 1 ]; then
    say "  ${C_YELLOW}[dry-run]${C_RESET} write $target"
    return 0
  fi
  ( umask 077; : > "$target" )
  for key in $AGENT_ENV_KEYS; do
    line="$(grep -m1 "^${key}=" .env 2>/dev/null || true)"
    if [ -n "$line" ]; then printf '%s\n' "$line" >> "$target"; fi
  done
  chmod 600 "$target"
}

# ---------- language selection ----------
if [ -z "$LANG_CODE" ] && [ -t 0 ]; then
  banner
  say "${C_BOLD}$(t select_language)${C_RESET}"
  say ""
  say "  ${C_CYAN}1)${C_RESET} $(t english)"
  say "  ${C_CYAN}2)${C_RESET} $(t russian)"
  say ""
  while ! LANG_CODE="$(read_language)"; do :; done
fi
LANG_CODE="${LANG_CODE:-en}"
case "$LANG_CODE" in en|ru) ;; *) LANG_CODE="en" ;; esac

# ---------- mode selection ----------
if [ -z "$MODE" ] && [ -t 0 ]; then
  banner
  say "${C_BOLD}$(t select_mode)${C_RESET}"
  say ""
  say "  ${C_CYAN}1)${C_RESET} ${C_BOLD}$(t all_in_one)${C_RESET}"
  say "  ${C_CYAN}2)${C_RESET} $(t panel_only)"
  say "  ${C_CYAN}3)${C_RESET} $(t node_agent)"
  say "  ${C_CYAN}4)${C_RESET} $(t subscription)"
  say "  ${C_CYAN}5)${C_RESET} $(t control)"
  say "  ${C_CYAN}0)${C_RESET} $(t exit)"
  say ""
  printf '%b' "$(t choice)" >&2
  while ! MODE="$(read_choice)"; do printf '%b' "$(t choice)" >&2; done
fi
MODE="${MODE:-all-in-one}"

if [ -z "$DOMAIN" ]; then
  if [ "$MODE" = "node" ]; then DOMAIN="$(ask "$(t panel_url_prompt)" "http://localhost")"; else DOMAIN="$(ask "$(t domain_prompt)" "localhost")"; fi
fi

PANEL_URL="${PANEL_URL:-$DOMAIN}"
case "$PANEL_URL" in http://*|https://*) ;; *) PANEL_URL="https://$PANEL_URL" ;; esac
LE_EMAIL="${LE_EMAIL:-admin@${DOMAIN#https://}}"
NODE_ID="${NODE_ID:-node-$(hostname | tr -cd '[:alnum:]' | cut -c1-12)}"
AGENT_TOKEN="${AGENT_TOKEN:-}"

line
say "${C_BOLD}${C_CYAN}$(t summary)${C_RESET}"
say "  $(t mode):       ${C_BOLD}$MODE${C_RESET}"
say "  $(t domain):     ${C_BOLD}$DOMAIN${C_RESET}"
say "  $(t panel_url):  ${C_BOLD}$PANEL_URL${C_RESET}"
if [ "$MODE" = "node" ]; then say "  $(t node_id):    ${C_BOLD}$NODE_ID${C_RESET}"; fi
say "  $(t dry_run):    ${C_BOLD}$DRY_RUN${C_RESET}"
line

if ! confirm "$(t proceed)"; then say "$(t cancelled)"; exit 0; fi

# ---------- удалённая нода: онбординг по SSH ----------
# Режим node + --ssh-host означает «поставить агент не здесь, а на ноде».
# Вся логика — в scripts/add-node.sh; здесь только передача параметров.
if [ "$MODE" = "node" ] && [ -n "$SSH_HOST" ]; then
  INSTALLER_DIR=""
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  ADD_NODE="${INSTALLER_DIR:+$INSTALLER_DIR/scripts/add-node.sh}"
  if [ -z "$INSTALLER_DIR" ] || [ ! -f "$ADD_NODE" ]; then
    say "  ${C_RED}scripts/add-node.sh не найден.${C_RESET}"
    say "  ${C_DIM}Запустите установщик из клонированного репозитория:${C_RESET}"
    say "  ${C_DIM}git clone https://github.com/HakunaMaruna/XreyStudioServer.git && cd XreyStudioServer && ./install.sh --mode node --ssh-host $SSH_HOST${C_RESET}"
    exit 1
  fi
  ADD_NODE_ARGS=(--host "$SSH_HOST" --panel-url "$PANEL_URL" --user "${SSH_USER:-root}" --ssh-port "$SSH_PORT")
  [ -n "$NODE_ID_EXPLICIT" ] && ADD_NODE_ARGS+=(--node-id "$NODE_ID_EXPLICIT")
  [ -n "$AGENT_TOKEN" ] && ADD_NODE_ARGS+=(--token "$AGENT_TOKEN")
  [ "$DRY_RUN" -eq 1 ] && ADD_NODE_ARGS+=(--dry-run)
  run bash "$ADD_NODE" "${ADD_NODE_ARGS[@]}"
  exit $?
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

say "${C_BLUE}▸ $(t checking)${C_RESET}"
if ! command -v git >/dev/null 2>&1; then
  say "  ${C_RED}$(t git_required)${C_RESET}"; [ "$DRY_RUN" -eq 0 ] && exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  say "  ${C_YELLOW}$(t docker_installing)${C_RESET}"
  run_sh "curl -fsSL https://get.docker.com | sh"
fi
if ! $SUDO docker compose version >/dev/null 2>&1; then
  say "  ${C_RED}$(t compose_required)${C_RESET}"; [ "$DRY_RUN" -eq 0 ] && exit 1
fi
if command -v docker >/dev/null 2>&1; then say "  ${C_GREEN}✓ Docker $(docker --version | awk '{print $3}')${C_RESET}"; fi

DIR="${INSTALL_DIR:-$PWD}"
if [ ! -f "$DIR/docker-compose.yml" ]; then
  say "${C_BLUE}▸ $(printf "$(t cloning)" "$DIR")${C_RESET}"
  run git clone https://github.com/HakunaMaruna/XreyStudioServer.git "$DIR"
else
  say "  ${C_GREEN}✓ $(t repo_present)${C_RESET}"
fi
cd "$DIR"
DIR="$(pwd)"
run_sh "printf '%s\\n' '$MODE' > .xss-mode"
# Existing installations upgraded in place must also get an updater token.
if ! grep -q '^UPDATER_TOKEN=' .env 2>/dev/null; then
  UPDATER="$(openssl rand -hex 24)"
  run_sh "printf 'UPDATER_TOKEN=%s\\n' '$UPDATER' >> .env"
fi

if [ ! -f .env ]; then
  say "${C_BLUE}▸ $(t generating_env)${C_RESET}"
  run cp .env.example .env
  JWT="$(openssl rand -hex 32)"; REFRESH="$(openssl rand -hex 32)"; ADMIN="$(openssl rand -hex 24)"
  AGENT="${AGENT_TOKEN:-$(openssl rand -hex 32)}"; ALERT="$(openssl rand -hex 24)"; POSTGRES="$(openssl rand -hex 16)"
  UPDATER="$(openssl rand -hex 24)"
  if [ "$MODE" = "control" ]; then
    PDNS_KEY="$(openssl rand -hex 24)"; MASTER_KEY="$(openssl rand 32 | base64 -w0)"; STORE_TOKEN="$(openssl rand -hex 24)"
    say "  ${C_DIM}PDNS_API_KEY=$PDNS_KEY${C_RESET}"
    say "  ${C_DIM}PANEL_MASTER_KEY=$MASTER_KEY${C_RESET}"
    say "  ${C_DIM}STORE_ADMIN_TOKEN=$STORE_TOKEN${C_RESET}"
    run_sh "printf 'PANEL_MODE=control\\nSTORE_ADMIN_TOKEN=%s\\n' '$STORE_TOKEN' >> .env"
  fi
  run_sh "sed -i 's|^JWT_SECRET=.*|JWT_SECRET=$JWT|' .env"
  run_sh "sed -i 's|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$REFRESH|' .env"
  run_sh "sed -i 's|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN|' .env"
  run_sh "sed -i 's|^AGENT_SECRET=.*|AGENT_SECRET=$AGENT|' .env"
  run_sh "sed -i 's|^AGENT_TOKEN=.*|AGENT_TOKEN=$AGENT|' .env"
  run_sh "sed -i 's|^ALERT_WEBHOOK_TOKEN=.*|ALERT_WEBHOOK_TOKEN=$ALERT|' .env"
  run_sh "sed -i 's|^UPDATER_TOKEN=.*|UPDATER_TOKEN=$UPDATER|' .env"
  run_sh "sed -i 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES|' .env"
  run_sh "sed -i 's|^DOMAIN=.*|DOMAIN=$DOMAIN|' .env"
  run_sh "sed -i 's|^PANEL_URL=.*|PANEL_URL=$PANEL_URL|' .env"
  run_sh "sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$PANEL_URL|' .env"
  run_sh "sed -i 's|^NODE_DOMAIN_SUFFIX=.*|NODE_DOMAIN_SUFFIX=$DOMAIN|' .env"
  run_sh "sed -i 's|^LE_EMAIL=.*|LE_EMAIL=$LE_EMAIL|' .env"
  run_sh "sed -i 's|^NODE_ID=.*|NODE_ID=$NODE_ID|' .env"
  if [ "$MODE" = "control" ]; then
    run_sh "printf 'PDNS_API_KEY=%s\\nPANEL_MASTER_KEY=%s\\nNODE_DNS_ZONE=node.h2onetwork.pro\\nNODE_DNS_TTL=60\\n' '$PDNS_KEY' '$MASTER_KEY' >> .env"
  fi
  ADMIN_PASSWORD="$ADMIN"; ADMIN_EMAIL="admin@${DOMAIN#https://}"
else
  say "  ${C_YELLOW}! $(t env_present)${C_RESET}"
  ADMIN_PASSWORD="$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2 || true)"
  ADMIN_EMAIL="$(grep '^ADMIN_EMAIL=' .env | cut -d= -f2 || true)"
fi

# docker-compose.yml монтирует агенту только .agent.env, а не весь .env.
write_agent_env

case "$DOMAIN" in
  localhost|http://localhost|https://localhost) SKIP_DNS=1 ;;
  *) SKIP_DNS=0 ;;
esac
if [ "$SKIP_DNS" -eq 0 ]; then
  say "${C_BLUE}▸ $(t checking_dns)${C_RESET}"
  if command -v getent >/dev/null 2>&1 && ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
    say "  ${C_YELLOW}$(printf "$(t dns_fail)" "$DOMAIN")${C_RESET}"
  else
    say "  ${C_GREEN}$(printf "$(t dns_ok)" "$DOMAIN")${C_RESET}"
  fi
  say "  ${C_DIM}$(printf "$(t dns_note)" "$DOMAIN" "$DOMAIN")${C_RESET}"
fi

say "${C_BLUE}▸ $(t starting)${C_RESET}"
case "$MODE" in
  panel) run $SUDO docker compose up -d postgres redis backend caddy ;;
  # Only the agent: the default compose file has agent -> backend dependency,
  # which would build the whole panel on every node and can hang for minutes.
  node) run $SUDO docker compose -f docker-compose.node.yml up -d --build agent ;;
  subscription) run $SUDO docker compose up -d frontend caddy ;;
  all-in-one) run $SUDO docker compose up -d ;;
  control) run $SUDO docker compose -f docker-compose.control.yml up -d ;;
  *) say "Unknown mode: $MODE" >&2; exit 1 ;;
esac

# Терминальное меню доступно на хостах с панелью. На ноде и subscription
# backend/postgres нет, поэтому команда xss там не нужна.
if [ "$MODE" != "node" ] && [ "$MODE" != "subscription" ] && [ -f "$DIR/scripts/xss" ]; then
  XSS_BIN="${XSS_BIN:-/usr/local/bin/xss}"
  if [ -d "$(dirname "$XSS_BIN")" ]; then
    if run $SUDO ln -sfn "$DIR/scripts/xss" "$XSS_BIN"; then
      say "  ${C_GREEN}✓${C_RESET} CLI: ${C_BOLD}xss start${C_RESET}"
    else
      say "  ${C_YELLOW}!${C_RESET} не удалось создать $XSS_BIN; запустите: sudo ln -sfn $DIR/scripts/xss $XSS_BIN"
    fi
  fi
fi

line
say "${C_GREEN}${C_BOLD}$(t complete)${C_RESET}"
say ""
say "  ${C_BOLD}$(t panel_label):${C_RESET}    $PANEL_URL/login"
say "  ${C_BOLD}$(t docs_label):${C_RESET}     $PANEL_URL/docs"
say "  ${C_BOLD}$(t login_label):${C_RESET}    ${ADMIN_EMAIL:-admin@example.com}"
say "  ${C_BOLD}$(t password_label):${C_RESET} $ADMIN_PASSWORD"
say ""
say "${C_DIM}$(t secure_note)${C_RESET}"
