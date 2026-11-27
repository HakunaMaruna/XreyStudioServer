#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

# ============================================================================
# XreyStudioServer — canary rollout конфигурации нод с health gate и rollback.
#
# Порядок работы:
#   1. валидация аргументов до любых сетевых вызовов;
#   2. получение списка нод через GET /api/nodes (или --nodes);
#   3. применение конфигурации на canary-группе (по умолчанию 1 нода);
#   4. health gate: GET /api/nodes/:id/health в течение --wait секунд;
#   5. при успехе — применение на остальных нодах, при провале — автоматический
#      rollback canary-группы через POST /api/nodes/:id/rollback/:revisionId.
#
# Без --dry-run скрипт требует ADMIN_TOKEN (флаг --admin-token или env ADMIN_TOKEN).
# Токен передаётся только в заголовке Authorization и never логируется.
# ============================================================================
set -Eeuo pipefail
IFS=$'\n\t'

API_URL="${API_URL:-https://msc.h2onetwork.pro/api}"
NODES=""
ALL_NODES=false
CANARY=1
WAIT_SECONDS=60
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
DRY_RUN=false
REVISION_ID=""
HTTP_TIMEOUT=15

usage() {
  cat <<'EOF'
Usage: bash scripts/rollout.sh [options]

Options:
  --nodes <id1,id2,...>  явный список node id (через запятую)
  --all                  все доступные ноды из GET /api/nodes
  --canary <N>           размер canary-группы, по умолчанию 1
  --wait <seconds>       таймаут health gate на ноду, по умолчанию 60
  --revision-id <id>     конкретная ревизия для apply; без неё — активная
  --admin-token <JWT>    admin JWT (или переменная окружения ADMIN_TOKEN)
  --dry-run              только напечатать план, без сетевых вызовов
  --help                 показать эту справку

Exit codes:
  0 — успех или успешный dry-run
  1 — ошибка валидации аргументов
  2 — ошибка API (список нод, apply, health)
  3 — health gate не пройден; rollback выполнен или попытка rollback сделана
EOF
}

log() { printf '[rollout] %s\n' "$*"; }
die() { local code="$1"; shift; printf '[rollout] ERROR: %s\n' "$*" >&2; exit "$code"; }
mask() { [ "$#" -eq 0 ] && echo '<empty>' || echo '***'; }

is_uint() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -gt 0 ]; }
is_node_id() { [[ "$1" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --nodes)        [ "$#" -ge 2 ] || die 1 '--nodes requires a value'; NODES="$2"; shift 2 ;;
    --all)          ALL_NODES=true; shift ;;
    --canary)       [ "$#" -ge 2 ] || die 1 '--canary requires a value'; CANARY="$2"; shift 2 ;;
    --wait)         [ "$#" -ge 2 ] || die 1 '--wait requires a value'; WAIT_SECONDS="$2"; shift 2 ;;
    --revision-id)  [ "$#" -ge 2 ] || die 1 '--revision-id requires a value'; REVISION_ID="$2"; shift 2 ;;
    --admin-token)  [ "$#" -ge 2 ] || die 1 '--admin-token requires a value'; ADMIN_TOKEN="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --help|-h)      usage; exit 0 ;;
    *)              die 1 "unknown argument: $1" ;;
  esac
done

# --- валидация аргументов (до любых сетевых вызовов) -------------------------
[ "$ALL_NODES" = true ] && [ -n "$NODES" ] && die 1 'use either --nodes or --all, not both'
[ "$ALL_NODES" = false ] && [ -z "$NODES" ] && die 1 'specify --nodes or --all'
is_uint "$CANARY" || die 1 '--canary must be a positive integer'
is_uint "$WAIT_SECONDS" || die 1 '--wait must be a positive integer'
if [ -n "$REVISION_ID" ]; then
  is_node_id "$REVISION_ID" || die 1 '--revision-id contains invalid characters'
fi
if [ -n "$NODES" ]; then
  IFS=',' read -r -a NODE_ARRAY <<< "$NODES"
  [ "${#NODE_ARRAY[@]}" -gt 0 ] || die 1 '--nodes list is empty'
  for node in "${NODE_ARRAY[@]}"; do
    is_node_id "$node" || die 1 "invalid node id in --nodes: $node"
  done
else
  NODE_ARRAY=()
fi
[ "$DRY_RUN" = true ] || [ -n "$ADMIN_TOKEN" ] || die 1 'admin token required: use --admin-token or ADMIN_TOKEN'

# --- helpers -----------------------------------------------------------------
api() {
  local method="$1" path="$2" body="${3:-}"
  local -a args=(-sS -X "$method" -H "Authorization: Bearer ${ADMIN_TOKEN}"
    -H 'Content-Type: application/json' --max-time "$HTTP_TIMEOUT"
    -w '\n%{http_code}')
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  local response
  response="$(curl "${args[@]}" "${API_URL}${path}")" || return 2
  local code="${response##*$'\n'}"
  local payload="${response%$'\n'*}"
  CURL_STATUS="$code"
  CURL_BODY="$payload"
}

json_ids() {
  # Извлечь список id из JSON-массива или из объекта с полем nodes/data/items.
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if isinstance(data, dict):
    for key in ("nodes", "data", "items", "results"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
if not isinstance(data, list):
    sys.exit(1)
for item in data:
    if isinstance(item, dict) and isinstance(item.get("id"), str):
        print(item["id"])
'
}

extract_id() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if isinstance(data, dict):
    for key in ("revisionId", "id"):
        if isinstance(data.get(key), str):
            print(data[key]); break
'
}

previous_revision() {
  # Возвращает id ревизии, которая была applied до текущего rollout.
  api GET "/nodes/$1/revisions" >/dev/null 2>&1 || return 0
  python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
if isinstance(d, dict):
    for k in ("revisions", "data", "items"):
        if isinstance(d.get(k), list): d = d[k]; break
if not isinstance(d, list): sys.exit(0)
applied = [x for x in d if isinstance(x, dict) and x.get("applied") and isinstance(x.get("id"), str)]
if applied:
    print(applied[0]["id"]); sys.exit(0)
ids = [x["id"] for x in d if isinstance(x, dict) and isinstance(x.get("id"), str)]
if len(ids) > 1: print(ids[1])
' <<< "$CURL_BODY"
}

is_healthy() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if not isinstance(data, dict):
    sys.exit(1)
online = data.get("online") is True
status = str(data.get("status", "")).upper()
sys.exit(0 if (online or status == "ONLINE") else 1)
'
}

apply_node() {
  local node="$1" body='{}'
  [ -n "$REVISION_ID" ] && body="$(python3 -c 'import json,sys; print(json.dumps({"revisionId": sys.argv[1]}))' "$REVISION_ID")"
  api POST "/nodes/${node}/apply" "$body" || return 2
  [ "$CURL_STATUS" = 200 ] || [ "$CURL_STATUS" = 201 ] || {
    log "apply ${node}: HTTP ${CURL_STATUS}"; return 2;
  }
  local rid
  rid="$(extract_id <<< "$CURL_BODY")"
  [ -n "$rid" ] && printf '%s' "$rid" || printf '%s' "$REVISION_ID"
}

rollback_node() {
  local node="$1" rev="$2"
  [ -n "$rev" ] || { log "rollback ${node}: нет revisionId, пропуск"; return 1; }
  api POST "/nodes/${node}/rollback/${rev}" || return 2
  [ "$CURL_STATUS" = 200 ] || [ "$CURL_STATUS" = 201 ] || {
    log "rollback ${node}: HTTP ${CURL_STATUS}"; return 2;
  }
  log "rollback ${node}: выполнен (revision ${rev})"
}

wait_health() {
  local node="$1" deadline=$(( $(date +%s) + WAIT_SECONDS )) now
  while true; do
    if api GET "/nodes/${node}/health" && [ "$CURL_STATUS" = 200 ] && is_healthy <<< "$CURL_BODY"; then
      return 0
    fi
    now="$(date +%s)"
    [ "$now" -ge "$deadline" ] && return 1
    sleep 2
  done
}

# --- snapshot preflight ---------------------------------------------------------
if [ "$DRY_RUN" = false ]; then
  log 'creating pre-rollout snapshot'
  api POST /snapshots '{"label":"Pre-rollout snapshot","reason":"Configuration rollout","scope":"FULL"}' \
    || die 2 'не удалось создать снимок перед раскаткой'
  [ "$CURL_STATUS" = 201 ] || die 2 "POST /snapshots: HTTP ${CURL_STATUS}"
  log 'pre-rollout snapshot created'
fi

# --- основная логика ----------------------------------------------------------
if [ "$ALL_NODES" = true ]; then
  if [ "$DRY_RUN" = true ]; then
    log 'dry-run: GET /api/nodes (список нод будет получен из API)'
    mapfile -t NODE_ARRAY < <(printf 'node-from-api\n')
  else
    api GET '/nodes' || die 2 'не удалось получить список нод'
    [ "$CURL_STATUS" = 200 ] || die 2 "GET /nodes: HTTP ${CURL_STATUS}"
    mapfile -t NODE_ARRAY < <(json_ids <<< "$CURL_BODY")
    [ "${#NODE_ARRAY[@]}" -gt 0 ] || die 2 'API вернул пустой список нод'
  fi
fi

[ "${#NODE_ARRAY[@]}" -ge "$CANARY" ] || die 1 "canary=$CANARY больше числа нод=${#NODE_ARRAY[@]}"

log "rollout: nodes=${#NODE_ARRAY[@]} canary=$CANARY wait=${WAIT_SECONDS}s api=${API_URL} token=$(mask "$ADMIN_TOKEN")"
printf '[rollout] plan: canary=['; printf '%s ' "${NODE_ARRAY[@]:0:$CANARY}"; printf '] rest=['; printf '%s ' "${NODE_ARRAY[@]:$CANARY}"; printf ']\n'

if [ "$DRY_RUN" = true ]; then
  log 'dry-run: POST /nodes/<id>/apply для canary, health gate, POST /nodes/<id>/apply для остальных'
  log 'dry-run: при провале health gate — POST /nodes/<id>/rollback/<revisionId>'
  exit 0
fi

declare -a APPLIED=()

# canary.
for (( i=0; i<CANARY; i++ )); do
  node="${NODE_ARRAY[$i]}"
  log "canary apply: ${node}"
  prev="$(previous_revision "$node")"
  rev="$(apply_node "$node")" || die 2 "apply failed: ${node}"
  APPLIED+=("$node:${rev}:${prev}")
done

# health gate canary.
for (( i=0; i<CANARY; i++ )); do
  node="${NODE_ARRAY[$i]}"
  log "health gate: ${node} (до ${WAIT_SECONDS}s)"
  if ! wait_health "$node"; then
    log "health gate FAILED: ${node}"
    for entry in "${APPLIED[@]}"; do
      node="${entry%%:*}"
      rest="${entry#*:}"
      rev="${rest%%:*}"
      prev="${rest#*:}"
      rollback_node "$node" "${prev:-$rev}" || log "rollback ${node}: не удалось (требуется ручная проверка)"
    done
    exit 3
  fi
  log "health gate OK: ${node}"
done

# остальные ноды.
for (( i=CANARY; i<${#NODE_ARRAY[@]}; i++ )); do
  node="${NODE_ARRAY[$i]}"
  log "apply: ${node}"
  rev="$(apply_node "$node")" || {
    log "apply failed: ${node} — откатываем canary"
    for entry in "${APPLIED[@]}"; do
      n="${entry%%:*}"; rest="${entry#*:}"; r="${rest%%:*}"; p="${rest#*:}"
      rollback_node "$n" "${p:-$r}" || log "rollback ${n}: не удалось"
    done
    exit 2
  }
  log "apply OK: ${node} (revision ${rev})"
done

log 'rollout завершён успешно'
