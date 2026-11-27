#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

# XreyStudioServer — system snapshots CLI.
# POSIX sh compatible: no arrays, no [[ ]], no pipefail. Secrets are never printed.
# Online mode: curl + JWT from XSS_ADMIN_TOKEN against /api/snapshots.
# Offline mode: OFFLINE=1 restore from BACKUP_DIR/snapshots/<uuid>/manifest.json.
set -eu

# Project-local .env provides defaults; explicit environment values win.
_orig_api="${API_BASE_URL-}"
_orig_token="${XSS_ADMIN_TOKEN-}"
_orig_backup_dir="${BACKUP_DIR-}"
_orig_database_url="${DATABASE_URL-}"
_orig_settings_file="${SETTINGS_FILE-}"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
[ -z "$_orig_api" ] || API_BASE_URL=$_orig_api
[ -z "$_orig_token" ] || XSS_ADMIN_TOKEN=$_orig_token
[ -z "$_orig_backup_dir" ] || BACKUP_DIR=$_orig_backup_dir
[ -z "$_orig_database_url" ] || DATABASE_URL=$_orig_database_url
[ -z "$_orig_settings_file" ] || SETTINGS_FILE=$_orig_settings_file

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
XSS_ADMIN_TOKEN="${XSS_ADMIN_TOKEN:-}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
DATABASE_URL="${DATABASE_URL:-}"
SETTINGS_FILE="${SETTINGS_FILE:-${BACKUP_DIR}/panel-settings.json}"
CONFIRM="${CONFIRM:-0}"
DRY_RUN="${DRY_RUN:-0}"
OFFLINE="${OFFLINE:-0}"
COMPONENTS="${COMPONENTS:-}"
HTTP_TIMEOUT=20

cd "$(dirname "$0")/.."

log() { printf '[snapshot] %s\n' "$*"; }
warn() { printf '[snapshot] WARN: %s\n' "$*" >&2; }
die() { printf '[snapshot] ERROR: %s\n' "$*" >&2; exit 1; }

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

is_uint() {
  case "${1:-}" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

require_confirm() {
  [ "$CONFIRM" = 1 ] || die 'set CONFIRM=1 to proceed with a destructive operation'
}

require_online() {
  if is_true "$OFFLINE"; then die 'OFFLINE=1 is supported only for restore'; fi
  check_api_url
  [ -n "$XSS_ADMIN_TOKEN" ] || die 'XSS_ADMIN_TOKEN is required for online mode'
}

validate_uuid() {
  case "$1" in
    ????????-????-????-????-????????????) ;;
    *) die 'invalid snapshot id: UUID expected' ;;
  esac
  frag=${1//-/}
  case "$frag" in
    *[!0123456789abcdefABCDEF]*) die 'invalid snapshot id: UUID expected' ;;
  esac
  [ ${#frag} -eq 32 ] || die 'invalid snapshot id: UUID expected'
}

check_api_url() {
  _SNAP_API_URL="$API_BASE_URL" python3 -c '
import os, sys
value = os.environ["_SNAP_API_URL"]
if len(value) > 2048 or "\n" in value or "\r" in value or not value.startswith(("http://", "https://")):
    raise SystemExit("API_BASE_URL must be a short http(s) URL")
' || die 'API_BASE_URL must be a short http(s) URL'
}

# All JSON bodies are produced by python3 json.dumps; user input never enters sh -c or a format string.
api_request() {
  method=$1
  path=$2
  body=${3-}
  url="${API_BASE_URL%/}/api/snapshots${path}"
  if [ -n "$body" ]; then
    curl -sS --fail-with-body --max-time "$HTTP_TIMEOUT" -X "$method" \
      -H 'Accept: application/json' \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $XSS_ADMIN_TOKEN" \
      --data "$body" "$url"
  else
    curl -sS --fail-with-body --max-time "$HTTP_TIMEOUT" -X "$method" \
      -H 'Accept: application/json' \
      -H "Authorization: Bearer $XSS_ADMIN_TOKEN" "$url"
  fi
}

print_json() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception as exc:
    detail = raw.strip()[:500]
    if detail:
        sys.stderr.write("backend response: %s\n" % detail)
    raise SystemExit("invalid JSON response: %s" % exc)
sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
'
}

build_create_body() {
  _SNAP_LABEL="${LABEL:-}" _SNAP_REASON="${REASON:-}" _SNAP_SCOPE="${SCOPE:-}" python3 -c '
import json, os, re, sys
body = {}
for field, var, limit in (("label", "_SNAP_LABEL", 200), ("reason", "_SNAP_REASON", 1000)):
    value = os.environ.get(var, "")
    if value:
        if len(value) > limit:
            raise SystemExit("field %s is too long (max %d)" % (field, limit))
        body[field] = value
scope = os.environ.get("_SNAP_SCOPE", "")
if scope:
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", scope):
        raise SystemExit("scope contains unsupported characters")
    body["scope"] = scope
sys.stdout.write(json.dumps(body, ensure_ascii=False))
'
}

build_restore_body() {
  _SNAP_COMPONENTS="${COMPONENTS:-}" python3 -c '
import json, os, sys
body = {"confirm": True}
if os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes"):
    body["dryRun"] = True
raw = os.environ["_SNAP_COMPONENTS"].strip()
if raw:
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if not parts or any(part not in ("db", "settings") for part in parts):
        raise SystemExit("components must be a comma-separated subset of db,settings")
    ordered = [part for part in ("db", "settings") if part in parts]
    body["components"] = ordered
sys.stdout.write(json.dumps(body))
'
}

# Returns the validated, comma-separated component list for offline restore.
components_list() {
  _SNAP_COMPONENTS="${COMPONENTS:-db,settings}" python3 -c '
import os, sys
parts = [part.strip() for part in os.environ["_SNAP_COMPONENTS"].split(",") if part.strip()]
if not parts:
    parts = ["db", "settings"]
if any(part not in ("db", "settings") for part in parts):
    raise SystemExit("components must be a comma-separated subset of db,settings")
seen = []
for part in parts:
    if part not in seen:
        seen.append(part)
sys.stdout.write(",".join(seen))
'
}

components_include() {
  case ",${COMPONENTS:-}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

cmd_snapshot_create() {
  require_online
  [ "$#" -eq 0 ] || die 'create takes no positional arguments; use LABEL, REASON and SCOPE'
  body=$(build_create_body) || die 'invalid create parameters'
  api_request POST '' "$body" | print_json
}

cmd_snapshot_list() {
  require_online
  [ "$#" -eq 0 ] || die 'list takes no arguments'
  api_request GET '' | print_json
}

cmd_snapshot_policy() {
  require_online
  [ "$#" -eq 0 ] || die 'policy takes no arguments'
  api_request GET '/policy' | print_json
}

cmd_snapshot_set_policy() {
  require_online
  [ "$#" -gt 0 ] || die 'usage: snapshot.sh set-policy field=value [field=value ...]'
  unset _SNAP_POLICY_AUTO_BEFORE_UPDATES _SNAP_POLICY_AUTO_BEFORE_SETTINGS
  unset _SNAP_POLICY_RETENTION _SNAP_POLICY_COOLDOWN_MINUTES
  for arg do
    case "$arg" in
      autoBeforeUpdates=*)
        value=${arg#*=}
        [ "$value" = true ] || [ "$value" = false ] || die 'autoBeforeUpdates must be true or false'
        _SNAP_POLICY_AUTO_BEFORE_UPDATES=$value
        ;;
      autoBeforeSettings=*)
        value=${arg#*=}
        [ "$value" = true ] || [ "$value" = false ] || die 'autoBeforeSettings must be true or false'
        _SNAP_POLICY_AUTO_BEFORE_SETTINGS=$value
        ;;
      retention=*)
        value=${arg#*=}
        is_uint "$value" || die 'retention must be an integer'
        [ "$value" -ge 1 ] && [ "$value" -le 100000 ] || die 'retention must be between 1 and 100000'
        _SNAP_POLICY_RETENTION=$value
        ;;
      cooldownMinutes=*)
        value=${arg#*=}
        is_uint "$value" || die 'cooldownMinutes must be an integer'
        [ "$value" -le 100000 ] || die 'cooldownMinutes must be at most 100000'
        _SNAP_POLICY_COOLDOWN_MINUTES=$value
        ;;
      *) die "unknown policy field: ${arg%%=*}" ;;
    esac
  done
  body=$(python3 -c '
import json, os, sys
fields = (
    ("autoBeforeUpdates", "_SNAP_POLICY_AUTO_BEFORE_UPDATES", "bool"),
    ("autoBeforeSettings", "_SNAP_POLICY_AUTO_BEFORE_SETTINGS", "bool"),
    ("retention", "_SNAP_POLICY_RETENTION", "int"),
    ("cooldownMinutes", "_SNAP_POLICY_COOLDOWN_MINUTES", "int"),
)
body = {}
for name, var, kind in fields:
    if var not in os.environ:
        continue
    value = os.environ[var]
    body[name] = (value == "true") if kind == "bool" else int(value)
if not body:
    raise SystemExit("no policy fields supplied")
sys.stdout.write(json.dumps(body))
') || die 'invalid policy parameters'
  api_request PATCH '/policy' "$body" | print_json
}

cmd_snapshot_delete() {
  require_online
  [ "$#" -eq 1 ] || die 'usage: snapshot.sh delete <uuid>'
  validate_uuid "$1"
  require_confirm
  api_request DELETE "/$1" | print_json
}

cmd_snapshot_prune() {
  require_online
  [ "$#" -le 1 ] || die 'usage: snapshot.sh prune [keep]'
  require_confirm
  keep=${1:-${KEEP:-${BACKUP_KEEP:-7}}}
  is_uint "$keep" || die 'keep must be a positive integer'
  [ "$keep" -ge 1 ] || die 'keep must be a positive integer'
  response_file=$(mktemp "${TMPDIR:-/tmp}/xss-snapshots.XXXXXX") || die 'cannot create temporary file'
  trap 'rm -f "$response_file"' EXIT HUP INT TERM
  api_request GET '' > "$response_file"
  ids=$(python3 -c '
import json, os, re, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception as exc:
    raise SystemExit("invalid snapshot list: %s" % exc)
items = payload.get("items") if isinstance(payload, dict) and "items" in payload else (payload.get("data") if isinstance(payload, dict) else payload)
if not isinstance(items, list):
    raise SystemExit("unexpected snapshot list response")
uuid = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
items = [item for item in items if isinstance(item, dict) and uuid.fullmatch(str(item.get("id", "")))]
items.sort(key=lambda item: str(item.get("createdAt") or ""))
keep = int(os.environ["_SNAP_KEEP"])
for item in (items[:-keep] if keep < len(items) else []):
    print(item["id"])
') "$response_file" || die 'failed to parse snapshot list'
  deleted=$(printf '%s\n' "$ids" | grep -c . || true)
  ids_file="$response_file"
  printf '%s\n' "$ids" > "$ids_file"
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    api_request DELETE "/$id" >/dev/null
    log "deleted snapshot $id"
  done < "$ids_file"
  rm -f "$ids_file"
  trap - EXIT HUP INT TERM
  log "pruned $deleted snapshot(s), kept up to $keep"
}

online_restore() {
  require_online
  require_confirm
  body=$(build_restore_body) || die 'invalid restore parameters'
  api_request POST "/$1/restore" "$body" | print_json
}

offline_restore() {
  require_confirm
  id=$1
  [ -n "$DATABASE_URL" ] || die 'DATABASE_URL is required for offline restore'
  COMPONENTS=$(components_list) || die 'invalid components value'

  snapshot_dir=$(python3 -c '
import os, sys
sys.stdout.write(os.path.abspath(sys.argv[1]))
' "$BACKUP_DIR/snapshots/$id")
  manifest="$snapshot_dir/manifest.json"
  [ -f "$manifest" ] || die "manifest not found for snapshot $id"

  # Paths are taken from the manifest only and must stay inside the snapshot root.
  parsed=$(python3 -c '
import json, os, re, sys
root = os.path.realpath(sys.argv[1])
manifest_path = os.path.join(root, "manifest.json")
try:
    with open(manifest_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception as exc:
    raise SystemExit("cannot read manifest.json: %s" % exc)
if not isinstance(data, dict):
    raise SystemExit("manifest must be a JSON object")
checksum = data.get("checksum")
if not isinstance(checksum, str):
    raise SystemExit("manifest.checksum is missing")
checksum = checksum.strip()
if checksum.startswith("sha256:"):
    checksum = checksum[7:].strip()
if not re.fullmatch(r"[0-9a-fA-F]{64}", checksum):
    raise SystemExit("manifest.checksum must be a sha256 hex digest")

def inside(value, field):
    if not isinstance(value, str) or not value or any(ch in value for ch in ("\n", "\r", "\0")):
        raise SystemExit("manifest.%s is invalid" % field)
    path = os.path.realpath(os.path.join(root, value))
    try:
        if os.path.commonpath([root, path]) != root:
            raise SystemExit("manifest.%s escapes the snapshot directory" % field)
    except ValueError:
        raise SystemExit("manifest.%s escapes the snapshot directory" % field)
    return path

raw_db = data.get("dbFile")
if raw_db is None:
    raw_db = data.get("db")
if raw_db is None:
    raw_db = "db.sql.gz"
if not isinstance(raw_db, str):
    raise SystemExit("manifest.dbFile must be a string")
if os.path.basename(raw_db) != raw_db or os.path.splitext(raw_db)[1].lower() not in (".gz", ".sql"):
    raise SystemExit("manifest.dbFile must be a plain db.sql.gz or db.sql filename")
raw_settings = data.get("settingsFile")
if raw_settings is None:
    raw_settings = data.get("settings")
if raw_settings is None:
    raw_settings = "settings.json"
if not isinstance(raw_settings, str):
    raise SystemExit("manifest.settingsFile must be a string")
if os.path.basename(raw_settings) != raw_settings or raw_settings != "settings.json":
    raise SystemExit("manifest.settingsFile must be a plain settings.json filename")

db_path = inside(raw_db, "dbFile")
settings_path = inside(raw_settings, "settingsFile")
print(checksum.lower())
print(db_path)
print(settings_path)
' "$snapshot_dir") || die 'invalid snapshot manifest'

  expected=$(printf '%s\n' "$parsed" | sed -n '1p')
  db_path=$(printf '%s\n' "$parsed" | sed -n '2p')
  settings_path=$(printf '%s\n' "$parsed" | sed -n '3p')
  [ -n "$expected" ] && [ -n "$db_path" ] && [ -n "$settings_path" ] || die 'invalid snapshot manifest'
  [ -f "$db_path" ] || die 'database snapshot file not found'
  actual=$(sha256sum "$db_path" | awk '{print $1}' | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz')
  [ "$actual" = "$expected" ] || die 'database snapshot checksum mismatch'
  log "manifest and checksum verified for $id"

  if [ -f "$SETTINGS_FILE" ]; then
    if is_true "$DRY_RUN"; then
      log "dry-run: would copy current settings to $snapshot_dir/pre-restore-settings.json"
    else
      cp -p "$SETTINGS_FILE" "$snapshot_dir/pre-restore-settings.json" || die 'failed to save pre-restore settings'
    fi
  else
    warn 'current settings file not found; pre-restore copy skipped'
  fi

  if is_true "$DRY_RUN"; then
    if components_include db; then log "dry-run: would restore database from $db_path"; fi
    if components_include settings; then log "dry-run: would copy $settings_path to SETTINGS_FILE"; fi
    log 'dry-run: no changes applied'
    return 0
  fi

  if components_include db; then
    is_gzip=$(python3 -c '
import sys
with open(sys.argv[1], "rb") as handle:
    sys.stdout.write("1" if handle.read(2) == b"\x1f\x8b" else "0")
' "$db_path")
    if [ "$is_gzip" = 1 ]; then
      gzip -t "$db_path" || die 'compressed database snapshot is corrupt'
      log 'applying compressed database snapshot'
      gzip -dc "$db_path" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 || die 'psql restore failed'
    else
      log 'applying SQL database snapshot'
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$db_path" || die 'psql restore failed'
    fi
  fi

  if components_include settings; then
    [ -f "$settings_path" ] || die 'settings snapshot file not found'
    mkdir -p "$(dirname "$SETTINGS_FILE")" || die 'cannot create settings directory'
    cp -p "$settings_path" "$SETTINGS_FILE" || die 'settings restore failed'
    log 'settings restored'
  fi
  log "offline restore completed for $id"
}

usage() {
  cat <<'EOF'
Usage: sh scripts/snapshot.sh <command> [args]

Commands:
  create                          create a snapshot (LABEL, REASON, SCOPE optional)
  list                            list snapshots
  policy                          show snapshot policy
  set-policy field=value [...]    update autoBeforeUpdates, autoBeforeSettings,
                                  retention, cooldownMinutes
  restore <uuid>                  restore (requires CONFIRM=1; DRY_RUN=1 supported)
  delete <uuid>                   delete (requires CONFIRM=1)
  prune [keep]                    delete snapshots beyond keep (requires CONFIRM=1)
  help                            show this help

Environment:
  API_BASE_URL      default http://127.0.0.1:3000
  XSS_ADMIN_TOKEN   ADMIN JWT; required for online mode
  BACKUP_DIR        default backups; offline snapshots live in <BACKUP_DIR>/snapshots/<uuid>
  DATABASE_URL      required for offline database restore
  SETTINGS_FILE     default $BACKUP_DIR/panel-settings.json
  LABEL, REASON, SCOPE, COMPONENTS, KEEP, CONFIRM, DRY_RUN, OFFLINE
                    CLI inputs; COMPONENTS is a comma-separated subset of db,settings

Examples:
  XSS_ADMIN_TOKEN=... sh scripts/snapshot.sh create
  XSS_ADMIN_TOKEN=... CONFIRM=1 sh scripts/snapshot.sh restore <uuid>
  OFFLINE=1 CONFIRM=1 DRY_RUN=1 sh scripts/snapshot.sh restore <uuid>

EOF
}

cmd=${1:-help}
[ "$#" -gt 0 ] && shift
case "$cmd" in
  create)     cmd_snapshot_create "$@" ;;
  list)       cmd_snapshot_list "$@" ;;
  policy)     cmd_snapshot_policy "$@" ;;
  set-policy) cmd_snapshot_set_policy "$@" ;;
  restore)
    [ "$#" -eq 1 ] || die 'usage: snapshot.sh restore <uuid>'
    validate_uuid "$1"
    if is_true "$OFFLINE"; then
      offline_restore "$1"
    elif is_true "$CONFIRM"; then
      online_restore "$1"
    else
      body=$(build_restore_body) || die 'invalid restore parameters'
      api_request POST "/$1/restore" "$body" | print_json
    fi
    ;;
  delete) cmd_snapshot_delete "$@" ;;
  prune)  cmd_snapshot_prune "$@" ;;
  help|-h|--help) usage ;;
  *) usage >&2; die "unknown command: $cmd" ;;
esac
