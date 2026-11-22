# Installation Guide

## Requirements
- Ubuntu/Debian
- Docker + Docker Compose

## Modes
- panel: panel only
- node: agent + Xray
- subscription: subscription page only
- all-in-one: everything

## Steps
1. Copy `.env.example` to `.env` and set secrets (JWT, admin, POSTGRES_PASSWORD, ALERT_WEBHOOK_TOKEN).
2. Run `./install.sh <mode> <domain>`.
3. Open `https://<domain>`.

## Makefile
- `make install`, `make up`, `make down`, `make logs`, `make update`
- `make backup` — gzip PostgreSQL dump into `BACKUP_DIR` (default `backups/`), retention `BACKUP_KEEP` (default 7); cron example in `docs/backup.md`
- `make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz`
- `make monitoring` — Prometheus (`:9091`) + Grafana (`:3002`, password `GRAFANA_PASSWORD`)

## Monitoring
The monitoring services are behind the `monitoring` Compose profile and are not started by
`docker compose up` unless the profile is enabled. Grafana comes with the Prometheus datasource
and the `XreyStudioServer — Overview` dashboard pre-provisioned from `monitoring/`.
Provisioned Grafana alert rules and webhook delivery are described in `docs/monitoring.md`.
If you set `METRICS_TOKEN`, pass the same value as `X-Metrics-Token` in the Prometheus scrape
configuration (or leave it unset and keep `backend:3000` reachable only inside the Compose network).

## Password hashing

New passwords are hashed with Argon2id by default. Set `PASSWORD_HASHER=bcrypt` to keep using
bcrypt for new hashes. Existing hashes in both formats are verified automatically, so upgrades do
not require a password reset.

## Stripe webhooks
Set both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The webhook endpoint verifies the
`Stripe-Signature` header against the raw request body (HMAC-SHA256, 5-minute tolerance) and
ignores duplicate `checkout.session.completed` events for already paid invoices.

## Agent mTLS
For HTTPS agent URLs, set `AGENT_CA`, `AGENT_CERT` and `AGENT_KEY` to PEM file paths readable by
the backend container. Without these, signed `AGENT_TOKEN`/`AGENT_SECRET` headers are used.
