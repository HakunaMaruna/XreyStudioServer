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
  ADMIN=$(openssl rand -base64 18)
  sed -i "s/change-me-jwt-secret/$JWT/" .env
  sed -i "s/change-me-admin/$ADMIN/" .env
  sed -i "s/example.com/$DOMAIN/g" .env
  echo "Generated .env"
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