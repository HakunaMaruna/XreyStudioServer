# XreyStudioServer (XSS) — Xray Control Panel

Self-hosted control panel for Xray-core with multi-node agents, client management, subscriptions, payments, Telegram bot and monitoring.

## Stack
- Backend: NestJS (TypeScript), Prisma, PostgreSQL, Redis
- Frontend: Next.js, Tailwind CSS, shadcn/ui
- Agent: Node.js
- Proxy/TLS: Caddy
- Containers: Docker Compose

## Quick start
```bash
cp .env.example .env
make install
```
Modes: `./install.sh panel|node|subscription|all-in-one domain.com`

## Features
- Multi-tenant, RBAC (admin/operator/user)
- Nodes: registration, health, metrics, restart, config apply/rollback
- Users/clients, traffic limits, expiry
- Subscriptions: base64, Clash, sing-box, JSON, raw, QR, instructions
- Payments, plans, Telegram bot, alerts
- Audit logs, backup/restore

## API docs
`/docs` (Swagger)

## License
MIT