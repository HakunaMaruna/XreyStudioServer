# Architecture

## Components
- Panel (NestJS): REST API, auth, business logic, config generation, node orchestration.
- Agent (Node.js): registers, fetches config, applies to Xray, reports metrics.
- Frontend (Next.js): admin UI and public subscription page.
- PostgreSQL: primary data store.
- Redis: cache, queues, rate limiting.
- Caddy: reverse proxy and TLS.

## Data flow
1. Admin creates user/node/inbound via Panel.
2. Panel generates Xray config and sends to Agent over HTTPS/mTLS.
3. Agent writes config and reloads Xray.
4. Agent reports metrics to Panel.
5. Client opens subscription URL; Panel returns format based on User-Agent.

## Security
- JWT access/refresh, Argon2/bcrypt password hashing.
- mTLS for panel-agent.
- Rate limiting, helmet, validation, RBAC, audit logs.