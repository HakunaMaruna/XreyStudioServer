#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-all-in-one}"
DOMAIN="${2:-localhost}"

echo "[XSS] Mode: $MODE"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin missing"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  JWT=$(openssl rand -hex 32)
  REFRESH=$(openssl rand -hex 32)
  ADMIN=$(openssl rand -hex 24)
  AGENT=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$REFRESH|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN|" .env
  sed -i "s|^AGENT_SECRET=.*|AGENT_SECRET=$AGENT|" .env
  sed -i "s|^AGENT_TOKEN=.*|AGENT_TOKEN=$AGENT|" .env
  sed -i "s/example.com/$DOMAIN/g" .env
  echo "Generated .env with random JWT, admin and agent secrets"
fi

if grep -qE '^(JWT_SECRET|JWT_REFRESH_SECRET|ADMIN_PASSWORD|AGENT_TOKEN)=replace-with-' .env; then
  echo "WARNING: .env still contains placeholder secrets; rotate them before exposing the panel" >&2
fi

case "$MODE" in
  panel)
    docker compose up -d postgres redis backend caddy
    ;;
  node)
    docker compose up -d agent
    ;;
  subscription)
    docker compose up -d frontend caddy
    ;;
  all-in-one)
    docker compose up -d
    ;;
  *)
    echo "Unknown mode: $MODE"; exit 1
    ;;
esac

echo ""
echo "Panel URL: https://$DOMAIN"
echo "Admin login: $(grep ADMIN_EMAIL .env | cut -d= -f2)"
echo "Admin password: $(grep ADMIN_PASSWORD .env | cut -d= -f2)"
echo "Docs: https://$DOMAIN/docs"
if [ "$DOMAIN" != "localhost" ]; then
  echo ""
  echo "DNS required for automatic TLS:"
  echo "  $DOMAIN            A/AAAA  -> this server IP"
  echo "  *.$DOMAIN          A/AAAA  -> this server IP  (needed for node-<id> certificates)"
  echo "Ports 80 and 443 must be open for Let's Encrypt validation."
fi