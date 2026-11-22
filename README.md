# XreyStudioServer (XSS)

Self-hosted control panel for **Xray-core** with multi-node agents, client management, subscription delivery, payments, Telegram integration and monitoring.

> Short name: **XSS** · Repository: `XreyStudioServer`

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
- Telegram bot and notifications (Telegram, email, webhook).
- Dark/light theme, Russian and English UI, mobile responsive.
- Searchable, sortable, paginated tables; user edit forms and dashboard charts.
- Full CRUD forms for hosts and routing rules, plus a config revision browser with rollback.
- Server-side search, filtering and pagination for large user lists.
- Provisioned Grafana alerts delivered to Telegram via a token-protected webhook.
- Argon2id password hashing with transparent compatibility for existing bcrypt hashes.
- Hysteria2 / TUIC / WireGuard via a sing-box adapter on the node.
- Prometheus metrics and a pre-provisioned Grafana dashboard; Kubernetes manifests.

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
make monitoring  # start Prometheus + Grafana
```

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

Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (required for Stripe webhooks), `METRICS_TOKEN`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `GRAFANA_PASSWORD`, `BACKUP_DIR`, `BACKUP_KEEP`, `PASSWORD_HASHER` (`argon2id` by default, `bcrypt` to keep new hashes bcrypt), `ALERT_WEBHOOK_TOKEN` (shared secret for Grafana alerts), `AGENT_CA`/`AGENT_CERT`/`AGENT_KEY` (mTLS to agents), `SINGBOX_CONFIG_PATH`/`SINGBOX_BIN`/`SINGBOX_SERVICE` (non-Xray protocols).

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
- Global API rate limiting plus stricter limits on login/refresh.
- Verified Stripe webhook signatures (HMAC-SHA256, 5-minute tolerance).
- CSRF/XSS/SQL-injection/IDOR protections.
- Encrypted node secrets in database.
- mTLS or signed tokens between panel and agent.
- Least-privilege Docker containers.
- Audit logging without plaintext secrets.

## Monitoring

- Built-in node metrics: CPU, RAM, disk, traffic, active connections, Xray state.
- Health checks and alerts for offline nodes.
- Prometheus-compatible endpoint: `GET /api/metrics` (set `METRICS_TOKEN` and send `X-Metrics-Token` when exposed).
- Optional Prometheus + Grafana stack via `make monitoring`: Prometheus at `:9091`, Grafana at `:3002` with the pre-provisioned `XreyStudioServer — Overview` dashboard.
- Provisioned alert rules (`monitoring/grafana/provisioning/alerting/alerts.yml`) cover a down backend, offline nodes, high backend memory and high node CPU. Alerts are sent to `POST /api/notifications/alerts` with `Authorization: Bearer $ALERT_WEBHOOK_TOKEN` and forwarded to Telegram; set both `ALERT_WEBHOOK_TOKEN` and the Telegram variables to receive them.

## Backup and restore

```bash
make backup
make restore FILE=backups/db-20260101-120000.sql.gz
```

Backups are gzip-compressed PostgreSQL dumps stored in `backups/`; `BACKUP_DIR` sets the directory and `BACKUP_KEEP` controls retention (default 7). See `docs/backup.md` for a cron example and off-site copying.

## Protocol adapters

Xray-core handles VLESS, VMess, Trojan and Shadowsocks. Hysteria2, TUIC and WireGuard are
generated as a separate [sing-box](https://sing-box.sagernet.org/) config because Xray does not
implement them. The panel sends a dual config (`xray` + `singbox`) to the agent, which validates
each engine (`xray run -test` / `sing-box check`) and restarts the corresponding service. Install
`sing-box` on nodes that use these protocols; nodes without external inbounds keep the legacy
single-engine Xray config. Subscription exports include native links for all three protocols.

## Kubernetes

`k8s/` contains Kustomize manifests for PostgreSQL, Redis, API, panel, agent and Ingress.
See `k8s/README.md` for image builds, secrets and apply steps. It is an alternative to Compose,
not an additional requirement.

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
- `cd frontend && npm run lint && npm run build`
- Docker image build.
- GitHub Actions workflow: `.github/workflows/ci.yml`.

## Roadmap

- End-to-end API tests against a real disposable PostgreSQL instance.
- Client-side column sorting combined with server-side user paging.
- Email and Signal notification channels.

## License

MIT
