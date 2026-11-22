# API Overview

Base path: `/api`

- `POST /auth/login` — login (rate limited: 5 requests/minute)
- `POST /auth/refresh` — refresh token (rate limited: 10 requests/minute)
- `GET /users` — list users
- `POST /users` — create user
- `GET /nodes` — list nodes
- `POST /nodes` — create node
- `GET /nodes/:id/health` — node health
- `GET /subscriptions/:token` — subscription status (format by User-Agent)
- `GET /subscriptions/:token/raw` — raw links
- `GET /subscriptions/:token/base64` — base64 links
- `GET /payments` — list payments (ADMIN/OPERATOR)
- `POST /payments/webhook` — Stripe webhook; requires a valid `Stripe-Signature` header and
  `STRIPE_WEBHOOK_SECRET` on the server
- `GET /metrics` — Prometheus text exposition; optional `X-Metrics-Token` header when
  `METRICS_TOKEN` is set
- `GET /health`, `GET /health/live`, `GET /health/ready` — health checks

All other endpoints use the global limit configured by `THROTTLE_LIMIT`/`THROTTLE_TTL`
(120 requests/minute by default).

Swagger UI: `/docs`
