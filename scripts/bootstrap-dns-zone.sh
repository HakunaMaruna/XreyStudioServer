#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

# Создаёт зону node.h2onetwork.pro в PowerDNS Authoritative.
# Запускать на CONTROL-сервере после delegation зоны у регистратора.
set -euo pipefail

PDNS_API_URL="${PDNS_API_URL:-http://127.0.0.1:8081}"
PDNS_API_KEY="${PDNS_API_KEY:-}"
ZONE="${NODE_DNS_ZONE:-node.h2onetwork.pro}"
NS1="${DNS_NS1:-ns1.h2onetwork.pro.}"
NS2="${DNS_NS2:-ns2.h2onetwork.pro.}"
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --url) PDNS_API_URL="$2"; shift 2 ;;
    --key) PDNS_API_KEY="$2"; shift 2 ;;
    --zone) ZONE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

ZONE_FQDN="${ZONE%.}."
BODY=$(printf '{"name":"%s","kind":"Native","nameservers":["%s","%s"]}' "$ZONE_FQDN" "$NS1" "$NS2")

if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY RUN: POST ${PDNS_API_URL}/api/v1/servers/localhost/zones"
  echo "$BODY"
  exit 0
fi

[ -n "$PDNS_API_KEY" ] || { echo "PDNS_API_KEY is required" >&2; exit 2; }

RESPONSE=$(mktemp)
STATUS=$(curl -sS -o "$RESPONSE" -w '%{http_code}' \
  -X POST "${PDNS_API_URL%/}/api/v1/servers/localhost/zones" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $PDNS_API_KEY" \
  --data "$BODY")

case "$STATUS" in
  201) echo "Zone $ZONE created" ;;
  409|422) echo "Zone $ZONE already exists (HTTP $STATUS)" ;;
  *) echo "PowerDNS returned HTTP $STATUS" >&2; cat "$RESPONSE" >&2; exit 1 ;;
esac

echo "Check delegation: dig @127.0.0.1 $ZONE SOA +short"
