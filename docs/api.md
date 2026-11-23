# API Overview

Base path: `/api`

## Authentication

- `POST /auth/login` — login (rate limited: 5 requests/minute)
- `POST /auth/refresh` — refresh token (rate limited: 10 requests/minute)
- `POST /auth/logout` — revoke a refresh token
- `GET /auth/me` — current user

All admin endpoints require `Authorization: Bearer <accessToken>` and, where noted, an
`ADMIN` or `OPERATOR` role.

## Users

- `GET /users` — paginated list; query parameters `page`, `limit`, `search`, `status`, `role`,
  `sortBy` (`email`, `role`, `status`, `trafficLimit`, `trafficUsed`, `expiresAt`, `createdAt`)
  and `sortOrder` (`asc` | `desc`, default `desc`). Sorting happens in the database before paging.
  Response: `{ data, total, page, limit }`
- `POST /users` — create user
- `GET /users/stats` — aggregated counters
- `GET /users/:id` — user details
- `PATCH /users/:id` — update user (including password reset)
- `DELETE /users/:id` — delete user (ADMIN)
- `POST /users/bulk` — bulk `disable`, `enable`, `resetTraffic` or `delete`

## Nodes and configuration

- `GET /nodes`, `POST /nodes`, `GET /nodes/stats`
- `GET /nodes/:id`, `PATCH /nodes/:id`, `DELETE /nodes/:id`
- `GET /nodes/:id/health`, `POST /nodes/:id/restart`
- `GET /nodes/:id/logs?limit=200` — recent agent log entries (ADMIN/OPERATOR)
- `POST /nodes/:id/apply` — generate a new revision and apply it, or apply `{ revisionId }`
- `GET /nodes/:id/revisions` — last 50 config revisions
- `POST /nodes/:id/rollback/:revisionId` — apply an older revision
- `POST /nodes/register`, `POST /nodes/:id/metrics`, `GET /nodes/:id/config` — agent endpoints.
  `POST /nodes/:id/metrics` accepts an optional `users: [{ email, uplink, downlink }]` array with
  per-user traffic deltas in bytes; these update `User.trafficUsed`, daily `UserTraffic` records
  and quota enforcement.
- `GET /hosts`, `POST /hosts`, `GET /hosts/:id`, `PATCH /hosts/:id`, `DELETE /hosts/:id`
- `GET /rules`, `POST /rules`, `GET /rules/:id`, `PATCH /rules/:id`, `DELETE /rules/:id`

## Subscriptions and payments

- `GET /subscriptions/:token` — subscription status (format by User-Agent)
- `GET /subscriptions/:token/raw` — raw links
- `GET /subscriptions/:token/base64` — base64 links
- `GET /subscriptions/:token/clash`, `.../singbox`, `.../json` — client config exports
- `GET /payments` — list payments (ADMIN/OPERATOR)
- `GET /payments/plans`, `POST /payments/plans` — subscription plans; `POST /payments/plans` is ADMIN-only
- `POST /payments`, `POST /payments/:id/paid` — create a payment and mark it paid
- `POST /payments/webhook` — Stripe webhook; requires a valid `Stripe-Signature` header and
  `STRIPE_WEBHOOK_SECRET` on the server

## Administration

- `GET /audit?page&limit&entity&userId` — audit log (ADMIN/OPERATOR), sorted by `createdAt DESC`
- `GET /organizations`, `POST /organizations`, `GET /organizations/:id`,
  `PATCH /organizations/:id`, `DELETE /organizations/:id` — tenants (ADMIN only)
- `GET /backups`, `POST /backups`, `GET /backups/:name/download`, `DELETE /backups/:name` —
  PostgreSQL snapshots (ADMIN only)

## Operations

- `POST /notifications/test` — broadcast a test notification to all configured channels (ADMIN)
- `GET /notifications/channels` — which channels are configured (no secrets)
- `GET /notifications/alerts?page&limit&status` — persisted alert history (ADMIN)
- `POST /notifications/alerts` — Grafana alert webhook; requires
  `Authorization: Bearer $ALERT_WEBHOOK_TOKEN`. Persists each alert in `AlertHistory`, returns
  `{ received, persisted, telegram, signal, webhook, email }` and forwards the message to all
  configured channels.
- `GET /metrics` — Prometheus text exposition; optional `X-Metrics-Token` header when
  `METRICS_TOKEN` is set
- `GET /health`, `GET /health/live`, `GET /health/ready` — health checks

All other endpoints use the global limit configured by `THROTTLE_LIMIT`/`THROTTLE_TTL`
(120 requests/minute by default).

Swagger UI: `/docs`
