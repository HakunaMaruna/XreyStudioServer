#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna

# Deploy XreyStudioServer to a remote host over SSH for a quick IP:80 test.
# Usage: ./scripts/deploy-remote.sh <host> [user] [ssh-port]
set -euo pipefail

HOST="${1:?usage: deploy-remote.sh <host> [user] [ssh-port]}"
USER="${2:-root}"
PORT="${3:-22}"
DIR="${REMOTE_DIR:-$HOME/xss}"
REPO="https://github.com/HakunaMaruna/XreyStudioServer.git"

ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "$USER@$HOST" bash -s -- "$DIR" "$REPO" <<'REMOTE'
set -euo pipefail
DIR="$1"
REPO="$2"

echo "== checking prerequisites =="
command -v docker >/dev/null || { echo "docker is required"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose v2 is required"; exit 1; }
command -v git >/dev/null || { echo "git is required"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

echo "== fetching sources =="
mkdir -p "$DIR"
if [ ! -d "$DIR/.git" ]; then
  git clone "$REPO" "$DIR"
else
  git -C "$DIR" fetch origin
  git -C "$DIR" reset --hard origin/main
fi
cd "$DIR"

IP="$(hostname -I | awk '{print $1}')"
[ -n "$IP" ] || IP="127.0.0.1"

echo "== preparing .env =="
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  ADMIN_PASSWORD="$(openssl rand -hex 12)"
  JWT_SECRET="$(openssl rand -hex 32)"
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  AGENT_TOKEN="$(openssl rand -hex 24)"
  ALERT_TOKEN="$(openssl rand -hex 24)"

  sed -i \
    -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
    -e "s|^DOMAIN=.*|DOMAIN=:80|" \
    -e "s|^PANEL_URL=.*|PANEL_URL=http://${IP}|" \
    -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=http://${IP}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" \
    -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=admin@example.com|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|" \
    -e "s|^AGENT_TOKEN=.*|AGENT_TOKEN=${AGENT_TOKEN}|" \
    -e "s|^ALERT_WEBHOOK_TOKEN=.*|ALERT_WEBHOOK_TOKEN=${ALERT_TOKEN}|" \
    .env
  echo "ADMIN_EMAIL=admin@example.com"
  echo "ADMIN_PASSWORD=${ADMIN_PASSWORD}"
else
  echo "existing .env kept; current ADMIN_EMAIL/ADMIN_PASSWORD:"
  grep -E '^(ADMIN_EMAIL|ADMIN_PASSWORD)=' .env
fi

echo "== starting stack =="
docker compose up -d --build

echo "== waiting for API =="
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "backend is up"
    break
  fi
  sleep 2
done

echo "== status =="
docker compose ps
echo "Panel: http://${IP}/login"
echo "API:   http://${IP}/api/health"
echo "Docs:  http://${IP}/docs"
REMOTE
