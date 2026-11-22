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

## Upgrades
Pull the new version, rebuild and restart with `make update` (or `docker compose up -d --build`).
The database schema is applied automatically: the Kubernetes init container runs
`npx prisma db push --skip-generate`; for a manual deployment run
`cd backend && npx prisma db push` once before starting the new API. This creates the
`AlertHistory`, `UserTraffic` tables and the `Payment.planId` column without deleting data.
Take a backup first (`make backup`).

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

## Traffic accounting and quotas
The panel does not read Xray statistics by itself — a collector on each node reports per-user
usage. Issues a node bearer token with `POST /api/nodes/:id/rotate-token` (admin), then POST:

```bash
curl -X POST http://<panel>/api/nodes/<node_id>/traffic \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{"entries":[{"subscriptionToken":"<token>","up":1024,"down":2048}]}'
```

`up`/`down` are byte deltas for the period; an entry may also identify a user by `userId` or
`email`. Each report creates a `UserTraffic` row, increments `User.trafficUsed` and sets status
`EXPIRED` when `trafficLimit` (bytes, 0 = unlimited) is reached. Subscriptions then report
`exceeded` and config exports return `403`; reset with `POST /api/users/bulk` (`resetTraffic`).
History and totals are available at `GET /api/traffic` (admin/operator).

## Plans and payments
Create plans on the **Plans** page (or `POST /api/payments/plans`) with traffic in GB and duration
in days. When creating a manual payment (`POST /api/payments`), choose a plan; marking it paid
(`POST /api/payments/:id/paid`) activates the user, resets traffic and sets `expiresAt`. Stripe
Checkout events go through the same provisioning path when `client_reference_id` is the payment id.

## Node logs
The **Logs** button on the Nodes page calls `GET /api/nodes/:id/logs?service=xray|singbox&lines=200`.
The agent reads `journalctl -u <service>`; the backend container needs network access to the agent
and the same `AGENT_SECRET`. If `journalctl` is unavailable in a container, set
`XRAY_LOG_PATH` / `SINGBOX_LOG_PATH` to readable log files on the node as a fallback.
