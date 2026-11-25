#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

KEEP="${BACKUP_KEEP:-7}"
OUT_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

FILE="$OUT_DIR/db-$STAMP.sql.gz"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-xss}" "${POSTGRES_DB:-xss}" | gzip > "$FILE"
chmod 600 "$FILE" 2>/dev/null || true
{
  echo "event=manual"
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$FILE.meta"
chmod 600 "$FILE.meta" 2>/dev/null || true
echo "Backup created: $FILE"

find "$OUT_DIR" -maxdepth 1 -name 'db-*.sql.gz' -type f | sort -r | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.meta"
  echo "Removed old backup: $old"
done
