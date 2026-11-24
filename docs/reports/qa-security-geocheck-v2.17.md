# QA: security hardening v2.16 and node geocheck v2.17

Date: 2026-11-24. Owner: second agent, issue #145. Zone: `backend/test`, `docs/reports`.
Product code, versions, tags and releases are untouched. Branch `qa/security-geocheck-v217` is
based on `main` at `adfc65f` (v2.17.0). Final commit `3239dc1`. CI: all four jobs green, run
https://github.com/HakunaMaruna/XreyStudioServer/actions/runs/45351423067.

## Coverage added

`backend/test/security-hardening-geocheck.e2e-pg-spec.ts` — 6 PostgreSQL e2e tests against the
real `AppModule`, real guards, role metadata, tenant filters and PostgreSQL schema:

1. OPERATOR cannot change an ADMIN password or any other admin field. The ADMIN user is hidden
   by the tenant filter, so `PATCH /api/users/:id` returns 404, and the stored `passwordHash`
   and `trafficLimit` stay unchanged.
2. Inbounds are isolated by organization: OPERATOR creates/reads only own-org inbounds; creating
   an inbound on a foreign-org node returns 403; ADMIN sees all; reading a foreign inbound by id
   returns 404.
3. `POST /api/nodes/:id/traffic` with a valid node token records only own-org users. A foreign-org
   `userId` is skipped, and no `UserTraffic` row is created for it.
4. `GET /api/metrics` in production: 503 with a message naming `METRICS_TOKEN` when the variable
   is unset; 403 when it is set but the `x-metrics-token` header is missing or wrong; 200 with a
   Prometheus text body containing `xss_users_total` when the header matches.
5. `POST /api/nodes/:id/geo` requires the node bearer token: 403 without it, 201 with it; the
   `countryCode`/`city` are stored in `NodeGeo` and surfaced in `GET /api/nodes` under `geo`.
   A repeat call upserts the row. The token hash is never serialized.
6. Legitimate agent flows still work with a seeded config revision: `GET /api/nodes/:id/config`
   returns the revision with the node token, `POST /api/nodes/:id/traffic` records own-org
   traffic, and `GET /api/metrics` is public in non-production.

## Fixes to existing tests in the same zone

- `backend/test/postgres.e2e-pg-spec.ts`: the v2.16 tenant filter in `TrafficService` skips users
  whose organization differs from the node's. The old fixture created the traffic node without
  `organizationId`, so the recorded traffic was 0. The node is now created with the admin's
  organization; no assertion was weakened.
- `backend/test/mcp.e2e-pg-spec.ts`: the `panel_status` assertion hardcoded version `2.15.5`.
  It now imports and compares against `APP_VERSION`, so it stays correct across releases.

Both are test-only changes; no product behaviour was relaxed.

## Live smoke, https://msc.h2onetwork.pro

| Check | Result |
| --- | --- |
| `GET /api/health` | 200, `status: ok`, `db: ok` |
| `GET /api/metrics` unauthenticated in production | 503, `METRICS_TOKEN is not configured` |
| `POST /api/mcp` with an empty JSON-RPC body | 401, `MCP token or admin JWT required` |

## Limitations

Authenticated live checks — admin login, a test user subscription with two links, and an
`initialize` call over MCP with a real token — were not performed. The repository secrets
`LIVE_ADMIN_EMAIL` / `LIVE_ADMIN_PASSWORD` are empty — tracked in issue #122; no credentials or
`MCP_TOKEN` were provided for this task. These checks remain `SKIP` in the live smoke scenario.

All PostgreSQL scenarios were executed by GitHub Actions on Ubuntu with a real PostgreSQL 16
service. They were not run locally: npm dependency installation is unreliable in the Android
proot environment used by the agent.
