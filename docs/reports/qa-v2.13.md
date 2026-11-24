# QA: v2.9–v2.13 API coverage (issue #107)

Scope: issue #107, agent 2 zone only (`.github/workflows`, `backend/test`, `docs/reports`, `bench`).
Product code, versions, tags and releases untouched. Branch `qa/v213-e2e-107` rebased on
`origin/main` at `e38e184` (v2.15.2).

## Coverage

14 new PostgreSQL e2e tests; the 2 pending (`describe.skip`) device tests from QA v2.8 are
activated and rewritten against the shipped API (`token`/`hwid`, not the pre-release
`subscriptionToken`/`deviceId` draft).

`backend/test/devices.e2e-pg-spec.ts` (4 tests):

1. **Bind and lifecycle** — bind by subscription token, response `{bound, hwid, deviceLimit}`,
   list with `?userId=`, idempotent re-bind of the same hwid, admin `POST /devices`, delete and
   404 on a repeated delete; unknown token → 404, disabled user → 403.
2. **Device limit and subscription guard** — with `deviceLimit = 2`, the 3rd bind → 403;
   `GET /subscriptions/:token?format=json&hwid=bound` → 200 with `deviceCount`/`deviceIds` and
   updates `lastSeenAt`; an unbound hwid → 403; a request without hwid stays unrestricted.
3. **hwid ownership** — a hwid bound to one user cannot be bound by a second subscription (403).
4. **RBAC** — anonymous requests → 401, `USER` → 403 for list/add/delete.

`backend/test/health-checks.e2e-pg-spec.ts` (3 tests):

1. **Background client-eye probe** — a real TCP listener and a closed port are used as inbound
   targets; `HealthChecksService.run()` writes `success: true` with `latencyMs` and
   `success: false` with an error; history includes node name, host, port and tag.
2. **History API** — `GET /health-checks?nodeId=&limit=` filters and orders by `checkedAt`;
   `GET /health-checks/latest` exposes the newest rows.
3. **RBAC** — anonymous and `USER` requests → 401/403 for both endpoints.

`backend/test/subscription-templates.e2e-pg-spec.ts` (3 tests):

1. **CRUD** — create with `title`/`description`/`accent`/`instructions`/`footer`, list with
   `_count.users`, read, patch (incl. `enabled: false`), delete and 404 after delete.
2. **Subscription rendering** — `PATCH /users/:id` with `subscriptionTemplateId` attaches the
   template; `GET /subscriptions/:token` returns its rendered fields; disabling it yields
   `template: null`, re-enabling restores it; deleting the template clears the user relation.
3. **RBAC** — anonymous → 401, `USER` → 403, `OPERATOR` can create and list templates.

`backend/test/geodata.e2e-pg-spec.ts` (4 tests):

1. **Seed** — startup seeds `GEODATA_CATALOG.length` bundled categories (geosite + geoip);
   `POST /geodata/seed` is idempotent (`added: 0`).
2. **Filters** — `type`, case-insensitive `search`, `enabled` and an empty-result search.
3. **Custom categories** — code normalization, `source: custom`, duplicate → 409, unsupported
   type → 409, patch/disable/delete, 404 on a missing id.
4. **RBAC** — anonymous → 401, `USER` → 403 for list, seed, create, patch and delete.

`bench/scenarios/smoke.js`: `/api/devices`, `/api/health-checks`, `/api/subscription-templates`
and `/api/geodata` added to `PROTECTED` for both anonymous and authenticated live checks.

## Verification

Local (Node 20.15.1, PostgreSQL 16 on 127.0.0.1:55442 — the same engine CI uses):

- `npm run typecheck` — pass
- `npm run lint` — 0 errors (133 pre-existing warnings)
- `npm test -- --runInBand` — 5 suites, 19 tests pass
- `npm run build` — pass
- `npm run test:e2e:pg` — **10 suites, 42 tests pass** (was 26 passed / 2 skipped;
  the 2 old backup tests also pass on real PostgreSQL).

Live smoke against https://msc.h2onetwork.pro (local run without secrets): **14/14 checks pass** —
`/api/health` plus anonymous 401 on all protected paths, including the 4 new ones. Authenticated
reads and node ONLINE are skipped: `LIVE_ADMIN_EMAIL`/`LIVE_ADMIN_PASSWORD` are empty both locally
and in the CI smoke job (confirmed in run `45306759278` on PR #120 — 14/14 anonymous checks pass,
both authenticated checks `SKIP`). Configure those secrets to unblock that part of #107. Workflow
runs for `main` at `e38e184` (`CI`, `Live API smoke`, `Infra checks`, `Images`, `Release bundle`)
completed `success`.

PGlite caveat: a socket instance only survived the first test suite locally, and backup tests need
real `psql`, so the authoritative local run uses a real PostgreSQL 16 service rather than PGlite.

## Findings (separate bug issues, product code untouched)

- **#118** — `deviceLimit` is accepted by `CreateUserDto`/`UpdateUserDto` and sent by the users UI,
  but `UsersService.create()`/`update()` never persist it; the value stays `0` (unlimited), so
  HWID limits cannot be configured from the panel. The limit tests set it directly via Prisma.
- **#119** — `checkDevice()` is only called on `GET /subscriptions/:token`; the direct
  `/raw`, `/base64`, `/clash`, `/singbox` and `/json` routes accept `?hwid=` without enforcing the
  device limit or touching `lastSeenAt`. Not encoded as expected behaviour.

Carried over from earlier QA (not re-filed): `GET /api/config-profiles/:id` returns 200/null for a
missing id (#90); squads are global and `PATCH /squads/:id/members` accepts cross-tenant users
(#92).

Not covered here: real-cluster rollout, node ONLINE status, and the full `?hwid=` bypass until
#119 is fixed in product code.
