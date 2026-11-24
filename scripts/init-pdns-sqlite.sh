#!/usr/bin/env bash
# Инициализирует SQLite-базу PowerDNS в именованном volume (только CONTROL-режим).
# Запускать один раз перед первым стартом powerdns.
set -euo pipefail

VOLUME="${PDNS_VOLUME:-$(basename "$(pwd)")_pdns_data}"
SCHEMA="${PDNS_SCHEMA:-/share/doc/pdns/schema.sqlite3.sql}"

echo "Volume: $VOLUME"
if [ "$#" -gt 0 ] && [ "$1" = "--dry-run" ]; then
  echo "DRY RUN: create $VOLUME/pdns.sqlite3 from $SCHEMA"
  exit 0
fi

# Берём схему из образа PowerDNS, затем создаём БД через временный python-контейнер.
SCHEMA_TMP="$(mktemp)"
sudo docker create --name xss-pdns-schema-export psitrax/powerdns:latest true >/dev/null 2>&1 || true
sudo docker cp xss-pdns-schema-export:"$SCHEMA" "$SCHEMA_TMP" 2>/dev/null || true
sudo docker rm xss-pdns-schema-export >/dev/null 2>&1 || true

if [ ! -s "$SCHEMA_TMP" ]; then
  echo "Failed to extract PowerDNS schema from image" >&2
  exit 1
fi

sudo docker run --rm \
  -v "$VOLUME:/data" \
  -v "$SCHEMA_TMP:/schema.sql:ro" \
  python:3-alpine sh -c \
  'python -c "import sqlite3; c=sqlite3.connect(\"/data/pdns.sqlite3\"); c.executescript(open(\"/schema.sql\").read()); c.commit()" && chmod 0777 /data && chmod 0666 /data/pdns.sqlite3'
rm -f "$SCHEMA_TMP"
echo "PowerDNS SQLite database initialized"
