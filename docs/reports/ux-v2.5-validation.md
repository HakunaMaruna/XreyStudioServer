# UX v2.5 validation (QA/infrastructure)

Date: 2026-11-23 UTC. Scope: issue #79. Base: `origin/main` `8c2432e` (v2.4.1).
PR: #82. Follow-up issue for the finding: #83.
Product code (`backend/src`, `frontend/src`), versions and releases untouched.

## What was added

- `backend/test/ux-v25.e2e-pg-spec.ts` — three PostgreSQL e2e tests:
  1. admin creates a user → response exposes `subscriptionToken` → user is bound to an inbound
     via `clients[]` → `POST /api/nodes/:id/apply` generates a revision → the agent config
     (`GET /api/nodes/:id/config`, node token) contains the user with the subscription token;
     `GET /api/subscriptions/:token` returns `active` for the same token.
  2. a node belonging to tenant A does not receive users of tenant B, and a `clients[]` entry
     with `enabled: false` keeps the user out of the generated config.
  3. an inbound bound via `userId` produces a subscription link (`/json` and `/raw`) that
     contains the subscription token.
- `bench/scenarios/smoke.js` + `npm run smoke` — read-only live smoke checks:
  `GET /api/health` (`status=ok`, `db=ok`), anonymous `GET /api/inbounds`,
  `/api/reports/organizations`, `/api/nodes` must be rejected with 401/403. If
  `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` are provided, it also logs in and reads the same
  endpoints with a bearer token. `SMOKE_PANEL_SETTINGS_PATH` enables an optional settings read.
  Tokens and credentials are never printed.
- `.github/workflows/smoke.yml` — runs the smoke harness on pull requests, pushes to `main`,
  a nightly schedule and manually against `https://msc.h2onetwork.pro`. Secrets
  `LIVE_ADMIN_EMAIL` / `LIVE_ADMIN_PASSWORD` and optional `LIVE_PANEL_SETTINGS_PATH` are used
  when available; without them authenticated checks are explicitly skipped, so forks still pass.
- The existing `e2e-postgres` CI job already matches `*.e2e-pg-spec.ts`, so the new spec runs
  there without changing the backend job.

## Verification

| Check | Result |
| --- | --- |
| `backend: npm run typecheck` | pass (after `npm run prisma:generate`; local generated client was stale) |
| `backend: npm run lint` | pass, 0 errors / 94 pre-existing `no-explicit-any` warnings (#68 is not reproduced on v2.4.1) |
| `backend: npm test -- --runInBand` | 19/19 pass |
| `backend: npm run test:e2e` | 11/11 pass |
| `backend: npm run test:e2e:pg` | new spec 3/3 pass; other specs 12/14 pass |
| `bench: npm run smoke` (live) | 6/6 checks pass, 2 authenticated checks skipped |

The two local failures are the pre-existing backup tests in `v15.e2e-pg-spec.ts`: this sandbox has
no Docker/Postgres, so they ran against PGlite/WASM on `127.0.0.1:55432`. Prisma needs
`?pgbouncer=true` there, but `pg_dump`/`psql` reject that query parameter, producing HTTP 500.
This is an environment artifact; CI uses a real PostgreSQL 16 service and is authoritative.

Live smoke at 2026-11-23T22:46Z: `/api/health` returned `{"status":"ok","db":"ok"}`;
`/api/inbounds`, `/api/reports/organizations` and `/api/nodes` all returned 401 anonymously.
Authenticated checks were skipped locally because no live admin credentials are available;
the CI job will perform them when the secrets are configured.

## Panel Settings API

Not present in v2.4.1: `GET /api/settings/panel` returns 404 both locally and on the live host.
No settings tests were added because the endpoint and its DTOs do not exist yet. The smoke
harness already has an opt-in `SMOKE_PANEL_SETTINGS_PATH` hook; read/update and tenant-isolation
tests should be added once the product agent lands the API.

## Finding for the product agent

Binding a user only through `inbound.clients[]` adds the user to the generated node config, but
does **not** create a subscription link: `SubscriptionsService.loadUser()` reads
`User.inbounds` (driven by `Inbound.userId`), while `ConfigGeneratorService.generateConfig()`
reads `InboundClient[]`. The current inbound UI sends only `clients[]`, so the user is present on
the node but sees an empty subscription link list. The new e2e spec documents both paths.
Suggested fix (outside this agent's zone): make clients[] bindings visible to the subscriptions
service or have the UI set `userId` as well. Tracked as #83. No product code was changed.
