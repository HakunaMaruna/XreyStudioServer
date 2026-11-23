# Architecture

## Components
- Panel (NestJS): REST API, auth, business logic, config generation, node orchestration.
  Passwords are hashed by a shared `PasswordService` (Argon2id by default, bcrypt-compatible).
- Agent (Node.js): registers, fetches config, applies to Xray and (optionally) sing-box, reports
  metrics, exposes an authenticated `/logs` ring buffer and reads per-user traffic from the Xray
  Stats API when `XRAY_STATS_ENABLED=true`.
- Protocol adapters: VLESS/VMess/Trojan/Shadowsocks are Xray inbounds; Hysteria2/TUIC/WireGuard are
  generated as a separate sing-box config in the same revision.
- Frontend (Next.js): admin UI and public subscription page.
- PostgreSQL: primary data store.
- Redis: shared rate limiting across backend replicas, with an in-memory fallback when Redis is down.
- Caddy: reverse proxy and TLS.

## Data flow
1. Admin creates user/node/inbound via Panel.
2. Panel generates Xray config (plus a sing-box config when external protocols are used) and sends it to Agent over HTTPS/mTLS.
3. Agent validates each engine (`xray run -test`, `sing-box check`), writes configs and reloads the services.
4. Agent reports metrics (and optional per-user traffic deltas) to Panel. The panel persists
   daily `UserTraffic` aggregates, increments `User.trafficUsed` and disables accounts that exceed
   their quota; the next config revision removes those clients from the nodes.
5. Client opens subscription URL; Panel returns format based on User-Agent.

The frontend is built around a reusable UI kit (`frontend/src/components/ui.tsx`), a single icon
set and design tokens in `globals.css`. The admin shell provides sectioned navigation, quick page
search, language/theme switching and responsive layouts; pages use modal forms and server-driven
tables.

## Deployment
- Docker Compose for small and medium installations; `k8s/` Kustomize manifests for Kubernetes.
- Prometheus/Grafana stack under the `monitoring` Compose profile, with file-provisioned alert
  rules delivered to the token-protected `POST /api/notifications/alerts` endpoint. The same
  configuration is rendered into `k8s/monitoring.json` for cluster deployments.
- PostgreSQL migrations live in `backend/prisma/migrations/`; existing `db push` databases must be
  baselined once with `prisma migrate resolve --applied 20261123000000_init`.

## Security
- JWT access/refresh, Argon2id password hashing (bcrypt hashes remain valid).
- mTLS for panel-agent, signed Stripe webhooks and a shared-secret Grafana alert webhook.
- Rate limiting (global, stricter on auth) backed by Redis, helmet, validation, RBAC, audit logs.
- Production startup refuses insecure JWT/admin secrets; backups and node logs are ADMIN/OPERATOR-only.