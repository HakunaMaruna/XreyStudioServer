# Verification report — v2.1.0 (issues #72, #68)

Date: 2026-11-23. Owner: second agent (CI/QA lane).
Tested revision: `204e0ce` (merge of PR #71, tag `v2.1.0`, "restore original admin design").
Raw load results: `bench/results/v2.1.0.json`. Harness: `bench/` (autocannon 7.15.0).

## CI check-runs against `main` (v2.1.0)

Source: GitHub Checks API for commit `204e0ce` (run `45262784639` and siblings).

| Job | Result |
| --- | --- |
| `backend` | **failure** — lint step, see #68 |
| `frontend` | success |
| `e2e-postgres` | success |
| `docker` (compose build) | success |
| `helm-chart` (helm lint) | success |
| `k8s-manifests` | success |
| `build-and-push` (agent / backend / frontend) | success |
| `bundle` | success |

## Local verification

Commands run from a clean `git clone` of `main`, Node 20.15.1, npm 10.9.1.

| Check | Result |
| --- | --- |
| `backend: npm run typecheck` | pass |
| `backend: npm run lint` | **1 error, 94 warnings** (`no-useless-assignment`) |
| `backend: npm test -- --runInBand` | pass (5 suites, 19 tests) |
| `backend: npm run build` | pass |
| `backend: npm run test:e2e` | pass (2 suites, 11 tests) |
| `frontend: npm run lint` | pass (0 errors, 95 warnings) |
| `frontend: npm run build` | locally blocked (see below) |
| `docker compose build`, `helm lint` | not available in sandbox; green in GH Actions |

The local frontend build fails before compiling: `@tailwindcss/turbopack` requires
`require()` of an ES module (`magic-string`), which needs Node >= 20.19; the sandbox only has
20.15.1. This is a toolchain mismatch of the sandbox, not a code regression — the `frontend` and
`build-and-push (frontend, ./frontend)` jobs are green on GitHub Actions.

## #68 verification (backend lint)

- The v2.1.0 rollback (`984b60b..204e0ce`) does **not** touch
  `backend/src/modules/certificates/certificates.service.ts`; line 86 still reads
  `let agent: any = { skipped: true };` and both `try`/`catch` branches overwrite it.
- Clean `npm ci` from `backend/package-lock.json` installs ESLint 10.15.0;
  `cd backend && npm run lint` deterministically exits 1 with
  `no-useless-assignment` at `certificates.service.ts:86`. The same error is already
  produced by ESLint 10.0.1 with the repo config, so it is not a recent ESLint drift.
- The CI failure (`45262784639/job/138001668952`) is the same error: local clean install and
  GitHub Actions agree. A local install that reports 0 errors must be using a different
  ESLint version or a stale working tree; no config difference exists in the repository.
- Issue #68 is therefore still valid and reproducible. No product code was changed here.

## Load test (v2.1.0)

Docker, k6 and SysV shared memory are unavailable in the sandbox, so a native PostgreSQL
16 server cannot boot (`shmget: Function not implemented`). The run instead used PGlite
0.6.0 (PostgreSQL compiled to WASM) behind `pglite-socket` 0.3.0 on TCP port 55432 with a
20-connection multiplexer. The compiled backend (`node dist/main.js`) ran on localhost:3100
against a dedicated PGlite database with 5,000 users, 1 node and a benchmark user with a
subscription token. `THROTTLE_LIMIT=100000` was set for the global limiter; the login route
keeps its fixed 5/minute throttle.

Setup:

```bash
DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres?pgbouncer=true' \
  npx prisma db push --skip-generate
NODE_ENV=production PORT=3100 JWT_SECRET=... ADMIN_PASSWORD=... METRICS_TOKEN=... \
  THROTTLE_LIMIT=100000 \
  DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres?pgbouncer=true' \
  node dist/main.js
cd bench && npm ci && DATABASE_URL=... BENCH_USERS=5000 npm run setup
BENCH_BASE_URL=http://127.0.0.1:3100 BENCH_DURATION=15 BENCH_CONNECTIONS=20 \
  BENCH_PIPELINING=1 npm run run
```

`pgbouncer=true` disables named prepared statements. Without it the PGlite multiplexer
returned artificial 500s (`prepared statement "s14" does not exist`); that first run was
discarded. The final run below had zero socket errors, timeouts and 5xx responses.

~15 s per scenario (15.03–15.10), 20 connections, pipeline 1, warm database. Latency in milliseconds;
`p97.5` is the closest autocannon percentile to p95.

| Scenario | Requests | rps | p50 | p90 | p97.5 | p99 | Errors | HTTP result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| login | 8,628 | 571.4 | 26 | 51 | 79 | 105 | 0 | 5×201, 8,623×429 (throttle) |
| users (5k rows, sorted/paged) | 460 | 30.6 | 564 | 907 | 1,283 | 1,383 | 0 | 460×200 |
| metrics | 274 | 18.2 | 999 | 1,462 | 1,663 | 1,784 | 0 | 274×200 |
| traffic (1 entry/report) | 360 | 24.0 | 640 | 1,298 | 1,565 | 1,606 | 0 | 360×201 |
| subscription (json) | 651 | 43.3 | 392 | 581 | 1,381 | 1,784 | 0 | 651×200 |

All raw counters are in `bench/results/v2.1.0.json`.

## Interpretation

- No functional regression was found in the five load scenarios: every authenticated and
  public request that was not intentionally throttled returned 2xx, with no socket errors
  or timeouts.
- Absolute latencies are **not comparable** to the v1.8.3 report (users p50 183 ms → 564 ms,
  metrics 117 ms → 999 ms). This run used a WASM PostgreSQL implementation in
  prepared-statement-free mode over a single multiplexed session, not native PostgreSQL in
  Compose. The slowdown is attributable to the harness environment, not to the v2.1.0 UI
  rollback, which does not change these backend endpoints.
- Login throughput is again dominated by the route-level limiter (5 accepted logins, the
  rest 429), so it says nothing about Argon2/bcrypt cost.

## Recommendations

1. Fix the lint regression in #68 so the `backend` CI job is green again.
2. Re-run the five scenarios against a real Compose stack / cluster (native PostgreSQL,
   Ingress and TLS) before using these numbers for the 5k users / 20 nodes capacity sign-off.
3. Use Node >= 20.19 for local frontend builds; CI already does.

This task changed no product code, dependency versions, releases or infrastructure manifests.
