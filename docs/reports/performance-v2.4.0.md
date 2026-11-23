# v2.4.x verification: CI, performance and live API

Date: 2026-11-23 UTC. Scope: issue #77. Agent 2 (CI/infrastructure/QA).
Product code (`backend/src`, `frontend/src`), versions and releases untouched.

## Version context

Issue #77 was written for v2.4.0 as the version on `main` and on `msc.h2onetwork.pro`.
During this verification `main` advanced to `22edbd6` (v2.6.0, PR #84); the QA branch used for
the checks is based on `8c2432e` (v2.4.1). The live host still behaves like v2.4.x:
`GET /api/settings` and `GET /api/routing/profiles` return 404 there, while those routes exist
in v2.5/v2.6. CI results below are reported for both refs.

## CI

| Check | `main` @ `22edbd6` (v2.6.0) | QA branch @ `88fcd57` (v2.4.1) |
| --- | --- | --- |
| backend (typecheck, lint, unit, build, e2e) | success | success |
| frontend (lint, build) | success | success |
| e2e-postgres (real PostgreSQL 16) | success | success (including the 3 new v2.5 onboarding tests) |
| docker compose build | success | success |
| k8s-manifests (kubeconform) | success | not triggered by that ref |
| helm-chart (lint/template) | success | chart present but path filter did not trigger |
| images (GHCR build/push) | success | not applicable |

#68 (`no-useless-assignment` in `certificates.service.ts`) is not reproduced: `npm run lint`
finishes with 0 errors (94 pre-existing `no-explicit-any` warnings) and the CI `backend` job is
green on both refs.

## Live API smoke (`https://msc.h2onetwork.pro`)

Executed at 2026-11-23T23:13Z with `bench/scenarios/smoke.js` (`npm run smoke`):

- `GET /api/health` → 200, `status=ok`, `db=ok`.
- Anonymous `GET /api/inbounds`, `/api/reports/organizations`, `/api/nodes` → 401 (guards active).
- `POST /api/auth/login`, authenticated reads and the `ONLINE` node assertion are implemented in
  the same harness and in `.github/workflows/smoke.yml`, but were **skipped locally**: no live
  admin credentials are available in this environment. Configure the repository secrets
  `LIVE_ADMIN_EMAIL` / `LIVE_ADMIN_PASSWORD` to enable these checks; they run on pull requests,
  pushes to `main`, nightly and manual dispatch, and the harness fails if no node is `ONLINE`.

Authenticated `GET /api/nodes` and `/api/reports/organizations` were therefore not verified
against the live host in this session. This is an access limitation, not an application failure.

## Performance — 5 scenarios, 5000 users

Target: local backend `v2.4.1` on `http://127.0.0.1:3100`, 5000 seeded users, 20 connections,
10 s per scenario (`bench`, autocannon). Raw data: `bench/results/v2.4.0.json`.

| Scenario | requests | rps | p50 ms | p97.5 ms | p99 ms | non-2xx | socket errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| login | 6539 | 646.8 | 24 | 62 | 79 | 6535 (429) | 0 |
| users (paged list) | 329 | 32.8 | 581 | 737 | 839 | 0 | 0 |
| metrics | 229 | 22.8 | 819 | 1068 | 1101 | 0 | 0 |
| traffic report | 280 | 27.9 | 655 | 1400 | 1444 | 0 | 0 |
| subscription JSON | 537 | 53.5 | 350 | 572 | 648 | 0 | 0 |

No socket errors/timeouts and no 5xx in any scenario. The `login` scenario is dominated by the
fixed per-IP `@Throttle({ limit: 5 })` on `/api/auth/login` (6535 responses with 429); only 4
requests were accepted. This is expected harness behaviour, already documented in `bench/README.md`.

### Environment caveat

This sandbox has no Docker and no SysV shared memory, so a real PostgreSQL 16 instance cannot
run. The target used PGlite/WASM over TCP at `127.0.0.1:55432` with `?pgbouncer=true` (needed to
avoid prepared-statement errors). WASM emulation and loopback networking dominate the latency
numbers, so they are **not directly comparable** with the v1.8.3 report, which used real
PostgreSQL. Re-run the same five scenarios against the Compose stack or cluster for capacity
sign-off; `bench/README.md` documents the setup.

## Follow-ups

- Configure `LIVE_ADMIN_EMAIL` / `LIVE_ADMIN_PASSWORD` secrets so the CI smoke can complete the
  authenticated and node-`ONLINE` checks from #77.
- Decide whether `main` (v2.6.0) should be deployed to `msc.h2onetwork.pro`, which currently
  exposes v2.4.x routes.
- Consider a configurable login throttle for load tests (product code — outside this agent's zone).
- No new regression bugs were found in v2.4.x CI; the earlier `clients[]` subscription-link gap
  is tracked separately as #83.
