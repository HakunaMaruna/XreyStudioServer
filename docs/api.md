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

- `POST /api/node-provision` (JWT, `ADMIN`) — installs an agent over SSH. Requires
  `SSH_PROVISION_ENABLED=true` on the panel. Body: `name`, `host`, `port`, `username`,
  `privateKey` or `password`, `hostKeyFingerprint` (`SHA256:<base64>`), optional `panelUrl`.
  The host key is verified against the supplied fingerprint; credentials are never stored
  or logged. Returns `nodeId`, `agentUrl` and a one-time `agentToken`.


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
- `GET /nodes/:id/logs?service=xray|singbox&lines=200` — tail agent logs through the panel (ADMIN/OPERATOR, tenant-scoped)
- `agentUrl` on create/update is the panel→agent endpoint. In production it must use `https://`
  unless `ALLOW_PRIVATE_AGENT_URLS=true` is set for a trusted private network; internal
  `AGENT_BASE_URL` (Compose/K8s) may stay plain HTTP inside the cluster network.
- `GET /hosts`, `POST /hosts`, `GET /hosts/:id`, `PATCH /hosts/:id`, `DELETE /hosts/:id`
- `GET /rules`, `POST /rules`, `GET /rules/:id`, `PATCH /rules/:id`, `DELETE /rules/:id`

## Subscriptions and payments

- `GET /subscriptions/:token` — subscription status (format by User-Agent); status may be
  filtered with `?status=active|expired|disabled|traffic_exceeded`.
- Without an explicit `format`, the client is detected from `User-Agent`:
  Clash / Clash Meta / Mihomo / Happ / ClashVerge -> `clash`, sing-box -> `singbox`,
  Shadowrocket / Quantumult / Loon / Surge / Stash -> `base64`, other clients -> `json`.
  Explicit `?format=raw|base64|clash|singbox|json` overrides detection; unknown values are
  ignored and detection is used instead.
  `active`, `disabled`, `expired` or `exceeded` (traffic quota spent)
- Config export endpoints return `403` when the subscription is not `active`
- `GET /subscriptions/:token/raw` — raw links
- `GET /subscriptions/:token/base64` — base64 links
- `GET /subscriptions/:token/clash`, `.../singbox`, `.../json` — client config exports
- `GET /payments` — list payments (ADMIN)
- `POST /payments` — create a payment; optional `planId` provisions that plan when paid
- `POST /payments/:id/paid` — mark paid; with `planId` activates the user, resets traffic and sets `expiresAt`
- `GET /payments/plans`, `POST /payments/plans`, `PATCH /payments/plans/:id` — subscription plans
- `POST /payments/webhook` — Stripe webhook; requires a valid `Stripe-Signature` header and
  `STRIPE_WEBHOOK_SECRET` on the server
- `GET /traffic?userId=&page=&limit=` — per-user traffic report history with byte totals (ADMIN)
- `GET /traffic/chart?userId=&days=1..90` — traffic for the last `days` UTC days, grouped by day
  (ADMIN). Response: `{ days, series: [{ date, up, down, total }], total }`; byte values
  are decimal strings.
- `GET /traffic/export.csv?userId=&from=&to=` — traffic rows as CSV (ADMIN)
- `GET /audit?page=&limit=&entity=&action=&userId=` — audit log with filters (ADMIN)
- `GET /audit/export.csv?entity=&userId=&action=&from=&to=` — audit rows as CSV (ADMIN)
- `GET /payments/export.csv?from=&to=` — payments as CSV (ADMIN)

CSV endpoints return `text/csv` with a header row and at most 10 000 rows; narrow `from`/`to` to
keep exports within that cap. Headers:

- traffic: `createdAt,userId,nodeId,period,bytesUp,bytesDown,total`
- audit: `createdAt,userId,action,entity,entityId,ip,metadata`
- payments: `createdAt,userId,email,amount,currency,status,provider,plan,externalId`

## Reports

- `GET /api/metrics/traffic/nodes` (JWT, `ADMIN`) — aggregated `UserTraffic` by node and
  period: `{ nodeId, nodeName, period, bytesUp, bytesDown }`. Bytes are strings to avoid
  JSON precision loss.


- `GET /reports/organizations?from&to` — per-tenant users, active users, nodes, online nodes and
  traffic totals (includes a bucket for users/nodes without an organization)
- `GET /reports/protocols` — inbound counts, enabled counts and distinct users/nodes by protocol
- `GET /reports/organizations.csv?from&to`, `GET /reports/protocols.csv` — CSV exports

All report endpoints require an `ADMIN` JWT.

## Node geocheck

- `POST /nodes/:id/geo` — agent reports its exit IP geolocation (node token auth).
  Fields: `ip`, `countryCode`, `city`, `asn`, `org`.
- Result is included in `GET /nodes` as `geo` and shown in the nodes table.
- Configured with `GEOCHECK_URL` (default `https://ipinfo.io/json`) and `GEOCHECK_INTERVAL` (6h).

## MCP bridge

- `POST /api/mcp` — read-only MCP server over Streamable HTTP (stateless). See `docs/mcp.md`.
- Auth: `X-MCP-Token` (env `MCP_TOKEN`) or an ADMIN JWT bearer token.
- Tools: `panel_status`, `list_users`, `list_nodes`, `health_summary`, `list_inbounds`,
  `list_subscription_templates`, `geodata_search`.

## Geodata catalog

- `GET /geodata?type=geosite|geoip&search&enabled` — browsable catalog of routing categories
- `POST /geodata/seed` — re-add missing bundled categories (idempotent)
- `POST /geodata` — custom category `{ type, code, name, description?, enabled? }`
- `PATCH /geodata/:id`, `DELETE /geodata/:id` — edit/remove (custom categories are removable)
- Catalog is seeded automatically on startup; copy a rule as `"geosite:google"` / `"geoip:ru"` from the UI.

## Subscription templates

- `GET /subscription-templates` — list templates with assigned user counts
- `GET /subscription-templates/:id`, `POST`, `PATCH :id`, `DELETE :id` — CRUD (ADMIN/OPERATOR)
  - fields: `name`, `title`, `description`, `accent` (hex color), `instructions` (JSON object: platform → text), `footer`, `enabled`
- Assign to a user via `PATCH /users/:id { subscriptionTemplateId }`.
- `GET /subscriptions/:token?format=json` returns `template` when the user's template is enabled.
  The public `/sub/:token` page applies its title, description, accent, instructions and footer.

## Client-eye health checks

- `GET /health-checks?nodeId&limit` — TCP connect latency from the panel to every enabled inbound
- `GET /health-checks/latest` — latest result per inbound
- Background probe runs every `HEALTH_CHECK_INTERVAL` seconds (default 300), minimum 30.

## Devices (HWID limits)

- `GET /devices?userId` — list devices (ADMIN/OPERATOR)
- `POST /devices` — bind a device manually `{ userId, hwid, name? }`, enforces `deviceLimit`
- `POST /devices/bind` — public bind by `{ token, hwid, name? }` using subscription token
- `DELETE /devices/:id` — unbind
- `GET /subscriptions/:token?hwid=<hwid>` — rejects with 403 when the device limit is reached
  and the HWID is not registered; updates `lastSeenAt` for known devices.
- The browser page at `/sub/<token>` generates an opaque HWID (`localStorage`, UUID v4),
  calls `POST /devices/bind` once and sends `?hwid=` with status/config requests.
  HWIDs are validated (8–128 chars: letters, digits, `_.:-`) before any database lookup.

## User squads

- `GET /squads`, `GET /squads/:id` (includes members), `POST /squads`, `PATCH /squads/:id`,
  `DELETE /squads/:id` — manage user groups with shared traffic limit and expiry.
- `PATCH /squads/:id/members` with `{ userIds: [] }` replaces group membership.
- `PATCH /users/:id` accepts `squadId` to attach a single user.

## Config profiles

- Config profiles support `nodeId`: `POST/PATCH /config-profiles` accepts a global node id
  (nodes belonging to an organization are rejected). `GET /config-profiles` returns
  `node: { id, name }` for each profile.


- `GET /config-profiles`, `GET /config-profiles/:id`, `POST /config-profiles`,
  `PATCH /config-profiles/:id`, `DELETE /config-profiles/:id` — manage user config templates.
- Payload accepts `routingRules[]`, `dnsServers[]` and `outbounds[]`, merged into generated Xray config.
- `PATCH /users/:id` with `configProfileId` attaches a profile to a user.

## DNS (CONTROL mode only)

- `GET /dns/status` — mode, availability, PowerDNS version, zone/queries/uptime/metrics.
- `GET/POST /dns/zones`, `DELETE /dns/zones/:name` — zone management.
- `GET/POST /dns/zone/:zone/records`, `DELETE /dns/zone/:zone/records` — record management.
- `GET/PATCH /dns/settings` — API URL/key (encrypted), zone, TTL, NS, bind IP.

ADMIN only; hidden in TENANT mode. See `docs/powerdns.md`.

## Cheburcheck

- `POST /cheburcheck/check { nodeId?, target? }` — live block-list + SSE probe check.
- `GET /cheburcheck/results?nodeId&limit` — stored checks (tenant-scoped).
- `GET /cheburcheck/status` — service status and token credits.
- `GET /reports/cheburcheck?from&to` and `.csv` — report. See `docs/cheburcheck.md`.

## Notifications

- `GET/PATCH /notifications/settings` — channel configuration (encrypted at rest, secrets
  never returned) and delivery policy (quiet hours, cooldown, severity). ADMIN only.
- `GET /notifications/deliveries` — recent delivery log.
- `POST /notifications/test { channel?, text? }` — test a single channel or all.
- `GET/POST /notification-routes` — event × channel routing (includes `SIGNAL`);
  OPERATOR is scoped to their organization. See `docs/notifications.md`.

## Reports

- `GET /reports/traffic/timeseries?days=30` or `?from&to` — daily traffic buckets,
  previous-period comparison, top users. `GET /reports/traffic/timeseries.csv` exports
  the same filtered data. ADMIN only. See `docs/reports.md`.
- `GET /reports/organizations?from&to`, `GET /reports/protocols` and their `.csv` variants.

## Routing profiles

- `GET /routing` — list routing profiles (tenant-scoped)
- `POST /routing`, `PATCH /routing/:id`, `DELETE /routing/:id` — manage profiles (JSON payload)
- `GET /routing/recipes/list` — curated presets (DNS, geo-direct, ads/torrent blocking, test outbound)
- `POST /routing/validate` — validate `{ payload }` before saving

Payload accepts `routingRules[]`, `dnsServers[]` and `outbounds[]`. Enabled profiles are merged
into the generated Xray config; see `docs/routing.md`.

## Panel settings

- `GET /settings` — current panel settings (ADMIN only)
- `PATCH /settings` — update language, theme, notification toggles, metrics flag, rate limit,
  CORS origin and session minutes. Stored in `backups/panel-settings.json`.

## User connection details

- `GET /users/:id` — user details plus `subscriptionUrl` and per-format subscription links
  (`json`, `clash`, `singbox`, `base64`) and `subscriptionToken`. ADMIN/OPERATOR only.

## Inbounds

`POST /api/inbounds` and `PATCH /api/inbounds/:id` accept:

- `tag`, `protocol`, `port`, `nodeId`, `userId`, `enabled`
- `listen` (default `0.0.0.0`), `transport` (`tcp|ws|grpc|httpupgrade|xhttp`), `security` (`none|tls|reality`)
- `flow`, `path`, `sni`, `serviceName`
- `trafficLimit` (bytes, `0` = unlimited), `expiresAt` (ISO date), `resetSchedule`
  (`never|hourly|daily|weekly|monthly`), `resetDay` (1–31 for monthly)
- `settings` — nested JSON for advanced Xray options (REALITY keys, certificates, headers, etc.)

The generator translates these fields into Xray `streamSettings`, client `flow` and inbound `listen`.

`fallbacks[]` links child inbounds to a master VLESS/Trojan TCP+TLS inbound; each item accepts
`childId`, `path`, `alpn`, `dest`, `xver`. `clients[]` sets per-user overrides: `userId`,
`trafficLimit` (bytes), `expiresAt`, `enabled`, `comment`, `sortIndex`. Disabled/expired/over-quota
clients are excluded from the generated config.

## Node certificates

- `GET /certificates/:nodeId` — issued certificate status for a node
- `POST /certificates/:nodeId/issue` — issue a Let's Encrypt certificate for the node hostname and
  install it on the agent
- `POST /certificates/renew-all` — re-issue/renew certificates for all nodes that have one

All certificate endpoints are ADMIN-only.

## Operations

## Signed updates

- `POST /api/updates/verify` (JWT, `ADMIN`) — body `{ "bundleBase64", "signatureBase64",
  "version" }` verifies an Ed25519 signature over the raw bundle bytes. The public key is
  read from `UPDATE_PUBLIC_KEY` (PEM). Returns `{ valid, version }`; fails closed (503) when
  no key is configured and 400 when sizes are invalid. The panel never accepts an unsigned
  bundle.
- Release bundles are signed in CI with the repository secret `UPDATE_PRIVATE_KEY`; the
  public key and `.sig` asset are attached to the GitHub Release. Local check:
  `node scripts/verify-update.mjs bundle.tar.gz bundle.tar.gz.sig update_public.pem`.


## Doctor

- `GET /api/doctor` (JWT, `ADMIN`) — read-only checks: database reachability, offline/stale
  nodes, failed client-eye health checks in the last 24h, expired node certificates and
  stale config revisions.
- `POST /api/doctor/fix` (JWT, `ADMIN`) — allow-listed safe fixes only. Currently
  `{ "checkId": "stale_revision", "entityId": "<node id>" }` re-applies the latest config
  revision to an ONLINE node; all other check ids are rejected.


- `POST /notifications/test` — broadcast a test notification to all configured channels (ADMIN)
- `GET /notifications/channels` — which channels are configured (no secrets)
- `GET /notifications/alerts?page&limit&status` — persisted alert history (ADMIN)
- `POST /notifications/alerts` — Grafana alert webhook; requires
  `Authorization: Bearer $ALERT_WEBHOOK_TOKEN`. Persists each alert in `AlertHistory`, returns
  `{ received, persisted, channels }` and delivers through `NotificationsService.emit()`.
  The alert name (`labels.alertname`, `labels.event` or `labels.notificationEvent`) is mapped to
  a `NotificationEvent` (for example `NODE_OFFLINE`, `TRAFFIC_ALERT`, `BACKUP_FAILED`,
  `PAYMENT_RECEIVED`); unknown names fall back to `TRAFFIC_ALERT`. Only channels explicitly
  enabled for that event in `NotificationRoute` receive the alert.
- `GET /notifications/routes` / `POST /notifications/routes` — list and upsert event-level
  notification routes (`event`, `channel`, `enabled`, optional `organizationId`). The GET endpoint
  is accessible with an `X-API-Token` holding the `NOTIFICATIONS` scope; POST requires ADMIN or
  that scoped token. Routes are tenant-scoped: a route with an `organizationId` only applies to
  notifications emitted with the same organization.
- Real producers call `emit(event, options, organizationId?)` instead of `broadcast()`: health
  checks emit `NODE_ONLINE`/`NODE_OFFLINE` only when inbound availability changes; failed backups
  emit `BACKUP_FAILED`; applied config revisions emit `CONFIG_APPLIED`; successful payments emit
  `PAYMENT_RECEIVED`. `POST /notifications/test` remains the only broadcast endpoint (manual test).
- `GET /metrics` — Prometheus text exposition; optional `X-Metrics-Token` header when
  `METRICS_TOKEN` is set (constant-time comparison)
- `GET /metrics/view` — the same metrics behind an admin JWT, used by the UI instead of exposing
  a `NEXT_PUBLIC_METRICS_TOKEN` in the browser bundle

Audit, reports, traffic and payments endpoints are ADMIN-only: they contain cross-tenant data.
Agent URLs must use http(s); private/LAN addresses are rejected unless `ALLOW_PRIVATE_AGENT_URLS=true`.
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
- `GET /backups/settings` — current schedule (`enabled`, `intervalHours`, `retention`,
  `lastRunAt`, `nextRunAt`)
- `PATCH /backups/settings` — update the schedule; `intervalHours` 1–720, `retention` 1–100

All other endpoints use the global limit configured by `THROTTLE_LIMIT`/`THROTTLE_TTL`
(120 requests/minute by default), with per-route `@Throttle` overrides where noted. Rate limiting
is backed by Redis (`REDIS_URL`) and falls back to in-memory storage when Redis is unset or
unavailable; the configured limits still apply.

Swagger UI: `/docs`

## Telegram bot (optional)

Set `TELEGRAM_BOT_TOKEN` plus `TELEGRAM_WEBHOOK_SECRET` (at least 16 characters) and point the
Telegram webhook at `POST /api/telegram-bot/webhook`. Telegram must send the same secret in the
`X-Telegram-Bot-Api-Secret-Token` header; keep it out of the URL so it never appears in proxy
logs. Requests with a missing or wrong secret are rejected. The bot supports `/start` (one-time
signed login link), `/login` (same), `/help` and `/status` (only reports whether this Telegram id
is linked). The signed token is short-lived and single-use.

- `GET /api/telegram-bot/login/validate?token=...` — redeems that token and returns only
  `{ telegramId }`; it never returns a JWT or a user id.
- `POST /api/telegram-bot/login/bind` with `{ "telegramId": number }` — JWT-protected; links the
  validated id to the authenticated session user. The user id comes from the session, never from
  the request body.

## Bulk inbound membership

`POST /api/inbounds/:inboundId/users/bulk` (ADMIN/OPERATOR) adds or removes users of one
inbound in a single call. The request body is validated and all user ids are checked against
the caller's tenant before any write; clients cannot target users outside their organization.

```json
{
  "mode": "add",
  "scope": "squad",
  "userIds": ["...uuid..."],
  "squadId": "...uuid..."
}
```

- `mode`: `add` or `remove`.
- `scope`: `selected` (requires `userIds`, up to 5000 UUIDs), `all` (computed server-side)
  or `squad` (requires `squadId`). Send only the field required by the chosen scope.
- Response: `{ "inboundId", "mode", "scope", "targetCount", "affected", "skipped" }`.
  `add` uses `createMany({ skipDuplicates: true })`, so repeated calls are idempotent;
  `skipped` reports clients that were already attached (or already absent on removal).
  Every call writes an `inbound.users.bulk.<mode>` audit record.

## Rescue CLI

For hosts where the HTTP API is unreachable, run on the database host:

```
npm run rescue -- list-admins
RESCUE_NEW_PASSWORD='long-random-password' npm run rescue -- reset-password admin@example.com
npm run rescue -- promote user@example.com
npm run rescue -- demote admin@example.com
```

`npm run rescue` builds the project first, then executes `dist/scripts/rescue-cli.js`. Passwords
are never part of the argv when `RESCUE_NEW_PASSWORD` is used, never logged and never written to
the database in plaintext. `demote` refuses to remove the last active ADMIN. All operations go
through Prisma with bound parameters and print only email, id, role and status.
