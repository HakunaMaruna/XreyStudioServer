# Architecture

## Components
- Panel (NestJS): REST API, auth, business logic, config generation, node orchestration.
  Passwords are hashed by a shared `PasswordService` (Argon2id by default, bcrypt-compatible).
- Agent (Node.js): registers, fetches config, applies to Xray and (optionally) sing-box, reports metrics.
- Protocol adapters: VLESS/VMess/Trojan/Shadowsocks are Xray inbounds; Hysteria2/TUIC/WireGuard are
  generated as a separate sing-box config in the same revision.
- Frontend (Next.js): admin UI and public subscription page. The v1.6.0 UI is built on design
  tokens in `globals.css`, a reusable component kit (`components/ui.tsx`), a single icon set and
  an app shell with sectioned navigation, quick page search, language/theme switching and
  responsive layouts. Pages use modal forms and server-driven tables.
- PostgreSQL: primary data store.
- Redis: cache, queues and shared rate limiting (counters shared across replicas when `REDIS_URL`
  is set); falls back automatically to in-memory limiting when Redis is absent or down.
- Caddy: reverse proxy and TLS.

## Data flow
1. Admin creates user/node/inbound via Panel.
2. Panel generates Xray config (plus a sing-box config when external protocols are used) and sends it to Agent over HTTPS/mTLS.
3. Agent validates each engine (`xray run -test`, `sing-box check`), writes configs and reloads the services.
4. Agent reports node metrics and per-user traffic to Panel; Panel checks quotas and can expire users.
5. Admin can tail node logs through the panel (agent `journalctl`/log-file reader).
6. Client opens subscription URL; Panel returns format based on User-Agent (403 when quota is spent).
7. Admin creates, lists, downloads and deletes PostgreSQL snapshots and restores one with explicit
   confirmation from the Backups page; the backup API shares the `./backups` mount with the CLI.
8. Admin views daily traffic charts (with an optional user filter) and exports CSV reports for
   traffic, audit and payments through the reporting API.

## Deployment
- Docker Compose for small and medium installations; `k8s/` Kustomize manifests for Kubernetes.
- Prometheus/Grafana stack under the `monitoring` Compose profile, with file-provisioned alert
  rules delivered to the token-protected `POST /api/notifications/alerts` endpoint.

## Security
- JWT access/refresh, Argon2id password hashing (bcrypt hashes remain valid).
- mTLS for panel-agent, signed Stripe webhooks and a shared-secret Grafana alert webhook.
- Rate limiting (global, stricter on auth; Redis-backed with in-memory fallback), helmet,
  validation, RBAC, audit logs.