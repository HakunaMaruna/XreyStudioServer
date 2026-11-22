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
make backup      # PostgreSQL dump
make restore FILE=backups/db.sql
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

Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `STRIPE_SECRET_KEY`.

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

## Security

- HTTPS is mandatory (Caddy).
- JWT access + refresh tokens.
- Password hashing with bcrypt (Argon2id supported).
- Rate limiting for API and subscription endpoints.
- CSRF/XSS/SQL-injection/IDOR protections.
- Encrypted node secrets in database.
- mTLS or signed tokens between panel and agent.
- Least-privilege Docker containers.
- Audit logging without plaintext secrets.

## Monitoring

- Built-in node metrics: CPU, RAM, disk, traffic, active connections, Xray state.
- Health checks and alerts for offline nodes.
- Prometheus-compatible metrics endpoint (optional extension).

## Backup and restore

```bash
make backup
make restore FILE=backups/db-2026-01-01.sql
```

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

- Backend typecheck and tests.
- Frontend build.
- Docker image build.
- GitHub Actions workflow: `.github/workflows/ci.yml`.

## Roadmap

- Full CRUD UI for inbounds/hosts/rules.
- Xray config validation and rollback UI.
- Prometheus/Grafana dashboards.
- Hysteria2 / TUIC / WireGuard adapters.
- Kubernetes manifests.

## License

MIT
