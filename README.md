# XreyStudioServer (XSS)

Self-hosted control panel for **Xray-core** with multi-node agents, client management, subscription delivery, payments, Telegram integration and monitoring.

> Short name: **XSS** · Repository: `XreyStudioServer` · Current version: **v1.8.5**

---

## Features

- Web admin panel for users, clients, nodes, inbounds, hosts and routing rules.
- Traffic limits, expiry dates, statuses, protocols and keys.
- Multi-node management: registration, health checks, metrics, logs, Xray restart.
- Xray configuration generation, validation, apply and rollback.
- Public subscription page with QR codes and client instructions.
- Subscription formats: raw, base64, Clash / Clash Meta, sing-box, JSON.
- Format auto-detection by `User-Agent`.
- RBAC: `ADMIN`, `OPERATOR`, `USER`.
- Multi-tenant organizations and white-label branding.
- Audit log, backups and restore.
- Payments, plans, trials, referrals and resellers (extensible).
- Notifications via Telegram, generic webhook, SMTP email and Signal (`signal-cli-rest-api`).
- Redesigned dark SaaS admin UI (v1.6.0): sidebar navigation, quick page search, modal forms,
  entrance animations, light theme, full Russian/English localization and mobile layout.
- Searchable, sortable, paginated tables; user edit forms and dashboard charts.
- Full CRUD forms for hosts and routing rules, plus a config revision browser with rollback.
- Server-side search, sorting, filtering and pagination for large user lists.
- Alert history stored in PostgreSQL with an admin UI and a channel-status overview.
- Provisioned Grafana alerts delivered through a token-protected webhook.
- Argon2id password hashing with transparent compatibility for existing bcrypt hashes.
- Per-user traffic reports from nodes, stored per period with automatic quota enforcement.
- Reports by organization and protocol with CSV export.
- Admin UI for audit logs, organizations, payments, subscription plans, inbound editing and node logs.
- Paid plans automatically activate users, reset traffic and set the expiry date.
- Hysteria2 / TUIC / WireGuard via a sing-box adapter on the node.
- Prometheus metrics and a pre-provisioned Grafana dashboard; Kubernetes manifests with Prometheus/Grafana.
- Backup and restore management in the UI, daily traffic charts and CSV exports.
- Redis-backed global rate limiting shared across replicas, with an in-memory fallback.

## Architecture

```text
                    ┌─────────────────────────────┐
                    │        Caddy (TLS)          │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
     ┌────────▼────────┐                       ┌────────▼────────┐
     │  Next.js Panel  │                       │  Public /sub    │
     │  + Admin UI     │                       │  Subscription   │
     └────────┬────────┘                       └────────┬────────┘
              │                                         │
              └────────────────────┬────────────────────┘
                                   │ REST / JWT
                          ┌────────▼────────┐
                          │  NestJS Backend │
                          │  Prisma + Redis │
                          └───┬─────────┬───┘
                              │         │
                    ┌─────────▼──┐  ┌───▼──────────┐
                    │ PostgreSQL │  │ Redis Cache  │
                    └────────────┘  └──────────────┘
                              │ mTLS / signed token
                    ┌─────────▼─────────────┐
                    │  Node Agent + Xray    │
                    └───────────────────────┘
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **NestJS (TypeScript)** | Modular clean architecture, DI, OpenAPI, fast CRUD development |
| Frontend | **Next.js + React** | SSR for subscription page, App Router, large ecosystem |
| UI | **Tailwind CSS + shadcn/ui** | Fast, accessible, customizable admin UI |
| Database | **PostgreSQL** | Reliable relational storage, JSONB, strong consistency |
| Cache / queues | **Redis** | Sessions, rate limiting, BullMQ jobs |
| Agent | **Node.js** | Lightweight, same language as backend, simple deployment |
| Proxy / TLS | **Caddy** | Automatic HTTPS, simple config |
| Containers | **Docker Compose** | Sufficient for 5k users / 20 nodes, simple ops |
| Containers (alt) | **Kubernetes** | `k8s/` Kustomize manifests with Ingress and TLS |

## Repository structure

```text
XreyStudioServer/
├── backend/                 # NestJS API, Prisma schema
│   ├── prisma/schema.prisma
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── modules/{auth,users,nodes,subscriptions,health}
├── frontend/                # Next.js admin + subscription page
│   └── src/app/{dashboard,sub/[token]}
├── agent/                   # Node agent for Xray nodes
├── k8s/                     # Kubernetes (Kustomize) manifests
├── monitoring/              # Prometheus config, Grafana dashboard and alert rules
├── scripts/                 # backup/restore helpers and cron example docs
├── docs/                    # architecture, install, API
├── .github/workflows/ci.yml # lint, typecheck, build, docker
├── docker-compose.yml
├── Caddyfile
├── install.sh
├── Makefile
├── .env.example
├── README.md                # English
└── README.ru.md             # Russian
```

## Quick start

### Requirements

- Ubuntu 22.04/24.04 or Debian 12
- Docker and Docker Compose plugin
- Domain name pointed to the server (for automatic TLS)

### Install

```bash
git clone https://github.com/HakunaMaruna/XreyStudioServer.git
cd XreyStudioServer
cp .env.example .env
./install.sh all-in-one your-domain.com
```

### Install modes

| Mode | Description |
|---|---|
| `panel` | Panel only (backend, DB, Redis, Caddy) |
| `node` | Node agent + Xray only |
| `subscription` | Public subscription page only |
| `all-in-one` | Panel, node agent and subscription page on one server |

```bash
./install.sh panel panel.example.com
./install.sh node node1.example.com
./install.sh subscription sub.example.com
./install.sh all-in-one example.com
```

### Makefile

```bash
make install     # run install.sh
make up          # docker compose up -d
make down        # docker compose down
make logs        # follow logs
make update      # pull, rebuild, restart
make backup      # compressed PostgreSQL dump (keeps last 7)
make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz
make monitoring     # start Prometheus + Grafana
make k8s-monitoring # regenerate k8s monitoring ConfigMaps from monitoring/
```

Upgrades: run `make update` (rebuild + restart); the database schema is applied automatically
(`prisma db push`). Back up first with `make backup`. See `docs/install.md` for traffic reporting,
plan provisioning and node log setup.

## Configuration

Copy `.env.example` to `.env` and set at least:

```env
DOMAIN=example.com
PANEL_URL=https://example.com
POSTGRES_USER=xss
POSTGRES_PASSWORD=strong-password
POSTGRES_DB=xss
JWT_SECRET=random-64-hex
JWT_REFRESH_SECRET=random-64-hex
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-admin-password
AGENT_TOKEN=random-agent-token
CORS_ORIGIN=https://example.com
```

Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_URL`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`/`ALERT_EMAIL_TO`, `SIGNAL_API_URL`/`SIGNAL_PHONE_NUMBER`/`SIGNAL_RECIPIENT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (required for Stripe webhooks), `METRICS_TOKEN`, `REDIS_URL` (shared rate limiting; in-memory fallback when unset), `THROTTLE_TTL`, `THROTTLE_LIMIT`, `GRAFANA_PASSWORD`, `BACKUP_DIR`, `BACKUP_KEEP`, `PASSWORD_HASHER` (`argon2id` by default, `bcrypt` to keep new hashes bcrypt), `ALERT_WEBHOOK_TOKEN` (shared secret for Grafana alerts), `AGENT_CA`/`AGENT_CERT`/`AGENT_KEY` (mTLS to agents), `SINGBOX_CONFIG_PATH`/`SINGBOX_BIN`/`SINGBOX_SERVICE` (non-Xray protocols), `XRAY_LOG_PATH`/`SINGBOX_LOG_PATH` (agent log fallback when `journalctl` is unavailable).

## API

- Swagger UI: `https://<domain>/docs`
- Base path: `/api`

Main endpoints:

```text
POST /api/auth/login
POST /api/auth/refresh
GET  /api/users
POST /api/users
GET  /api/nodes
POST /api/nodes
GET  /api/nodes/:id/health
GET  /api/subscriptions/:token
GET  /api/subscriptions/:token/raw
GET  /api/subscriptions/:token/base64
POST /api/nodes/:id/traffic
GET  /api/nodes/:id/logs
GET  /api/traffic
GET  /api/traffic/chart
GET  /api/traffic/export.csv
GET  /api/audit
GET  /api/audit/export.csv
GET  /api/payments/export.csv
GET  /api/payments/plans
GET  /api/backups
POST /api/backups
POST /api/backups/:name/restore
GET  /api/metrics
POST /api/payments/webhook
GET  /api/health
```

## Subscriptions

Public URL:

```text
https://<domain>/sub/<token>
```

Supported outputs:

- raw links
- base64
- Clash / Clash Meta
- sing-box
- JSON

The format is selected by the client `User-Agent`; the page also provides QR codes and per-platform instructions.
Hysteria2, TUIC and WireGuard clients are exported as native `hysteria2://`, `tuic://` and
`wireguard://` links plus Clash Meta / sing-box proxy entries.

## Security

- HTTPS is mandatory (Caddy).
- JWT access + refresh tokens.
- Password hashing with Argon2id (bcrypt hashes remain valid).
- Global API rate limiting backed by Redis (in-memory fallback) plus stricter limits on login/refresh.
- Production startup refuses insecure defaults: `JWT_SECRET` must be ≥32 chars and `ADMIN_PASSWORD` ≥12 chars.
- Verified Stripe webhook signatures (HMAC-SHA256, 5-minute tolerance).
- CSRF/XSS/SQL-injection/IDOR protections.
- Encrypted node secrets in database.
- mTLS or signed tokens between panel and agent.
- Least-privilege Docker containers.
- Audit logging without plaintext secrets.

### Agent channel

The agent API port is not published to the host (Compose/K8s): agents are reachable only through
the private network. The backend uses `AGENT_BASE_URL` (`http://agent:9090` in Compose) for nodes
without an explicit `agentUrl`; Helm sets it to the in-cluster agent Service automatically.
`install.sh` generates a random `AGENT_TOKEN`, which the agent sends to the panel and the panel
replays as `X-Agent-Secret` for config/log calls (constant-time comparison on both sides).

For agents on other hosts, the node's `agentUrl` must use `https://` in production; terminate mTLS
at a reverse proxy and trust the panel's client certificate there. `ALLOW_PRIVATE_AGENT_URLS=true`
relaxes both the private-host and HTTPS checks and must only be used for trusted private networks.
Internal `AGENT_BASE_URL` stays plain HTTP inside the Compose/K8s network. Subscription tokens are
URL path segments by API design, so subscription responses send `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`; keep access logs private and rotate a token if it leaks.

## Monitoring

- Built-in node metrics: CPU, RAM, disk, traffic, active connections, Xray state.
- Health checks and alerts for offline nodes.
- Prometheus-compatible endpoint: `GET /api/metrics` (set `METRICS_TOKEN` and send `X-Metrics-Token` when exposed).
- Optional Prometheus + Grafana stack via `make monitoring`: Prometheus at `:9091`, Grafana at `:3002` with the pre-provisioned `XreyStudioServer — Overview` dashboard. The Kubernetes manifests ship the same stack; regenerate its ConfigMaps with `make k8s-monitoring` and use `kubectl port-forward` to reach the UIs.
- Provisioned alert rules (`monitoring/grafana/provisioning/alerting/alerts.yml`) cover a down backend, offline nodes, high backend memory and high node CPU. Alerts are sent to `POST /api/notifications/alerts` with `Authorization: Bearer $ALERT_WEBHOOK_TOKEN` and forwarded to Telegram, webhook, SMTP email and Signal. Every alert is persisted in the
`AlertHistory` table and can be reviewed on the **Alerts** page (`/alerts`), which also shows which
channels are configured. See `docs/monitoring.md` for channel setup.

## Backup and restore

```bash
make backup
make restore FILE=backups/db-20260101-120000.sql.gz
```

Backups are gzip-compressed PostgreSQL dumps stored in `backups/`; `BACKUP_DIR` sets the directory and `BACKUP_KEEP` controls retention (default 7). Admins can also create, download, delete and restore snapshots from the **Backups** page (`/backups`); restore requires an explicit confirmation. The backend image includes `postgresql-client` and Compose mounts `./backups` into the container, so CLI and UI share the same files. See `docs/backup.md` for the UI workflow, a cron example and off-site copying.

## Protocol adapters

Xray-core handles VLESS, VMess, Trojan and Shadowsocks. Hysteria2, TUIC and WireGuard are
generated as a separate [sing-box](https://sing-box.sagernet.org/) config because Xray does not
implement them. The panel sends a dual config (`xray` + `singbox`) to the agent, which validates
each engine (`xray run -test` / `sing-box check`) and restarts the corresponding service. Install
`sing-box` on nodes that use these protocols; nodes without external inbounds keep the legacy
single-engine Xray config. Subscription exports include native links for all three protocols.

## Kubernetes

`k8s/` contains Kustomize manifests for PostgreSQL, Redis, API, panel, agent, Ingress and a
Prometheus + Grafana stack with the provisioned XSS dashboard and alerts. Regenerate the monitoring
ConfigMaps after changing anything in `monitoring/` (`make k8s-monitoring` or
`node k8s/generate-monitoring.mjs`). See `k8s/README.md` for image builds, secrets, apply and
port-forward steps. It is an alternative to Compose, not an additional requirement.

## Development

```bash
# backend
cd backend && npm install && npm run start:dev

# frontend
cd frontend && npm install && npm run dev

# agent
cd agent && npm install && npm start
```

## Testing and CI

- `cd backend && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`
- `DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:e2e:pg` — API tests against a real PostgreSQL database (the schema is pushed automatically; use a disposable DB).
- `cd frontend && npm run lint && npm run build`
- Docker image build.
- GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, both e2e suites (with a PostgreSQL 16 service container), builds and the Compose build.

## Roadmap

- Scheduled backups and retention policies configurable from the UI.
- Advanced reporting by organization and per-protocol traffic breakdowns.
- Helm chart and examples for an existing cluster Prometheus/Operator.

## License

MIT
