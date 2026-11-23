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
- `POST /nodes/:id/apply` — generate a new revision and apply it, or apply `{ revisionId }`
- `GET /nodes/:id/revisions` — last 50 config revisions
- `POST /nodes/:id/rollback/:revisionId` — apply an older revision
- `POST /nodes/register`, `POST /nodes/:id/metrics`, `GET /nodes/:id/config` — agent endpoints
- `POST /nodes/:id/traffic` — node-token-authenticated per-user traffic report:
  `{ "entries": [{ "subscriptionToken" | "userId" | "email", "up": 100, "down": 50 }] }`.
  Creates `UserTraffic` rows, increments `User.trafficUsed` and sets status `EXPIRED` when the
  quota is reached.
- `GET /nodes/:id/logs?service=xray|singbox&lines=200` — tail agent logs through the panel (ADMIN/OPERATOR)
- `GET /hosts`, `POST /hosts`, `GET /hosts/:id`, `PATCH /hosts/:id`, `DELETE /hosts/:id`
- `GET /rules`, `POST /rules`, `GET /rules/:id`, `PATCH /rules/:id`, `DELETE /rules/:id`

## Subscriptions and payments

- `GET /subscriptions/:token` — subscription status (format by User-Agent); status may be
  `active`, `disabled`, `expired` or `exceeded` (traffic quota spent)
- Config export endpoints return `403` when the subscription is not `active`
- `GET /subscriptions/:token/raw` — raw links
- `GET /subscriptions/:token/base64` — base64 links
- `GET /subscriptions/:token/clash`, `.../singbox`, `.../json` — client config exports
- `GET /payments` — list payments (ADMIN/OPERATOR)
- `POST /payments` — create a payment; optional `planId` provisions that plan when paid
- `POST /payments/:id/paid` — mark paid; with `planId` activates the user, resets traffic and sets `expiresAt`
- `GET /payments/plans`, `POST /payments/plans`, `PATCH /payments/plans/:id` — subscription plans
- `POST /payments/webhook` — Stripe webhook; requires a valid `Stripe-Signature` header and
  `STRIPE_WEBHOOK_SECRET` on the server
- `GET /traffic?userId=&page=&limit=` — per-user traffic report history with byte totals (ADMIN/OPERATOR)
- `GET /traffic/chart?userId=&days=1..90` — traffic for the last `days` UTC days, grouped by day
  (ADMIN/OPERATOR). Response: `{ days, series: [{ date, up, down, total }], total }`; byte values
  are decimal strings.
- `GET /traffic/export.csv?userId=&from=&to=` — traffic rows as CSV (ADMIN/OPERATOR)
- `GET /audit?page=&limit=&entity=&action=&userId=` — audit log with filters (ADMIN/OPERATOR)
- `GET /audit/export.csv?entity=&userId=&action=&from=&to=` — audit rows as CSV (ADMIN/OPERATOR)
- `GET /payments/export.csv?from=&to=` — payments as CSV (ADMIN/OPERATOR)

CSV endpoints return `text/csv` with a header row and at most 10 000 rows; narrow `from`/`to` to
keep exports within that cap. Headers:

- traffic: `createdAt,userId,nodeId,period,bytesUp,bytesDown,total`
- audit: `createdAt,userId,action,entity,entityId,ip,metadata`
- payments: `createdAt,userId,email,amount,currency,status,provider,plan,externalId`

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

## Backups API

All endpoints in this section are ADMIN-only and require JWT. Backups are gzip-compressed
`pg_dump` snapshots named `db-YYYYMMDD-HHMMSS.sql.gz`, stored in `BACKUP_DIR` (default `backups`)
and pruned to the last `BACKUP_KEEP` archives (default 7). The backend image includes
`postgresql-client` (`pg_dump`/`psql`), and Docker Compose mounts the host `./backups` directory
at `/app/backups` in the backend container, so the CLI and the UI share the same files.

- `GET /backups` — list backups: `{ data: [{ name, size, createdAt }], total }`
- `POST /backups` — create a snapshot; returns `{ name, size }`
- `GET /backups/:name/download` — download the `.sql.gz` file (binary)
- `DELETE /backups/:name` — delete a backup
- `POST /backups/:name/restore` — restore via `psql` into `DATABASE_URL`; body
  `{ "confirm": true }` is required. Restoring overwrites the current database.

All other endpoints use the global limit configured by `THROTTLE_LIMIT`/`THROTTLE_TTL`
(120 requests/minute by default), with per-route `@Throttle` overrides where noted. Rate limiting
is backed by Redis (`REDIS_URL`) and falls back to in-memory storage when Redis is unset or
unavailable; the configured limits still apply.

Swagger UI: `/docs`
