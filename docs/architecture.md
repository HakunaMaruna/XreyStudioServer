# Architecture

## Components
- Panel (NestJS): REST API, auth, business logic, config generation, node orchestration.
  Passwords are hashed by a shared `PasswordService` (Argon2id by default, bcrypt-compatible).
- Agent (Node.js): registers, fetches config, applies to Xray and (optionally) sing-box, reports metrics.
- Protocol adapters: VLESS/VMess/Trojan/Shadowsocks are Xray inbounds; Hysteria2/TUIC/WireGuard are
  generated as a separate sing-box config in the same revision.
- Frontend (Next.js): admin UI and public subscription page.
- PostgreSQL: primary data store.
- Redis: cache, queues, rate limiting.
- Caddy: reverse proxy and TLS.

## Data flow
1. Admin creates user/node/inbound via Panel.
2. Panel generates Xray config (plus a sing-box config when external protocols are used) and sends it to Agent over HTTPS/mTLS.
3. Agent validates each engine (`xray run -test`, `sing-box check`), writes configs and reloads the services.
4. Agent reports metrics to Panel.
5. Client opens subscription URL; Panel returns format based on User-Agent.

## Deployment
- Docker Compose for small and medium installations; `k8s/` Kustomize manifests for Kubernetes.
- Prometheus/Grafana stack under the `monitoring` Compose profile, with file-provisioned alert
  rules delivered to the token-protected `POST /api/notifications/alerts` endpoint.

## Security
- JWT access/refresh, Argon2id password hashing (bcrypt hashes remain valid).
- mTLS for panel-agent, signed Stripe webhooks and a shared-secret Grafana alert webhook.
- Rate limiting (global, stricter on auth), helmet, validation, RBAC, audit logs.