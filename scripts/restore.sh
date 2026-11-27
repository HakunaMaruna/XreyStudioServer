#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup.sql.gz|backup.sql>" >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "Backup not found: $FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

echo "Restoring from $FILE — existing data will be overwritten."
case "$FILE" in
  *.gz) gunzip -c "$FILE" ;;
  *) cat "$FILE" ;;
esac | docker compose exec -T postgres psql -U "${POSTGRES_USER:-xss}" "${POSTGRES_DB:-xss}" -v ON_ERROR_STOP=1

echo "Restore completed"
