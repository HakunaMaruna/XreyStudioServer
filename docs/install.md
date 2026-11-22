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

## Per-user traffic accounting
Set `XRAY_STATS_ENABLED=true` to add a loopback Xray API inbound to every generated config and
collect per-client uplink/downlink on the agent. The agent reads `xray api statsq` every 15 s,
converts cumulative counters to deltas and submits them with node metrics. The panel stores daily
per-user/per-node totals in `UserTraffic`, increments `User.trafficUsed` and disables an account
once its `trafficLimit` is reached; the next config push removes that client from the nodes.
`XRAY_API_HOST` / `XRAY_API_PORT` control the agent-side API address (defaults `127.0.0.1:8080`).

## Database migrations
An initial Prisma migration is checked in at `backend/prisma/migrations/20261123000000_init`.
For a fresh database apply it with:

```bash
cd backend && npx prisma migrate deploy
```

Existing installations created with `prisma db push` do not have the `_prisma_migrations`
table. Baseline them once instead of re-creating the schema:

```bash
cd backend && npx prisma migrate resolve --applied 20261123000000_init
```

`npm run prisma:migrate` creates future migrations during development,
`npm run prisma:deploy` applies them in production.
