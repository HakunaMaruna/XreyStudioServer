# Performance report — v1.8.3 HTTP endpoints

Date: 2026-11-23. Owner: second agent (issue #42, continues the work paused in #40).
Raw results: `bench/results/latest.json`. Harness: `bench/` (autocannon 7.15.0).
Tested revision: `70bf5ac` (main after the v1.8.5 security fixes); an earlier run on `15da624`
(v1.8.4) produced comparable numbers.

## Scope and setup

Target endpoints (one scenario each):

- `POST /api/auth/login`
- `GET /api/users?page=1&limit=50&sortBy=createdAt&sortOrder=desc` (JWT)
- `GET /api/metrics` (`x-metrics-token`)
- `POST /api/nodes/:id/traffic` (node token, one entry per report)
- `GET /api/subscriptions/:token/json` (public)

The target was the compiled backend (`node dist/main.js`) on localhost:3100 with a dedicated
PostgreSQL 16 database seeded by `bench/setup/seed.js`: 5,000 users, 1 node, 1 benchmark user with a
subscription token. Redis was not configured (in-memory throttler fallback). The backend was started
with `THROTTLE_LIMIT=100000` so the global limiter would not distort the authenticated scenarios.
The login route has its own fixed `@Throttle({ limit: 5, ttl: 60000 })` and is intentionally
throttled under load.

Docker Compose, k6 and a real cluster are unavailable in the sandbox, so this run measures HTTP +
Nest + PostgreSQL on localhost. It excludes container, Ingress, DNS and TLS overhead; a repeat run
against a deployed instance is still required before production sign-off.

Commands:

```bash
cd backend && DATABASE_URL=... npx prisma db push --skip-generate && npm run build
NODE_ENV=production PORT=3100 JWT_SECRET=... ADMIN_PASSWORD=... METRICS_TOKEN=... \
  THROTTLE_LIMIT=100000 DATABASE_URL=... node dist/main.js
cd ../bench && npm ci && DATABASE_URL=... npm run setup
BENCH_BASE_URL=http://127.0.0.1:3100 BENCH_DURATION=15 BENCH_CONNECTIONS=20 npm run run
```

## Results

15.03 s per scenario, 20 connections, pipeline 1, warm database. Latency in milliseconds.
`p97.5` is the closest autocannon percentile above p95; the true p95 is between `p90` and `p97.5`,
so `p97.5` is used as the conservative budget figure.

| Scenario | Requests | rps | p50 | p90 | p97.5 (≈p95 budget) | p99 | Socket errors | HTTP result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| login | 10,170 | 673.1 | 23 | 43 | 62 | 83 | 0 | 4×201, 10,166×429 (throttle) |
| users (5k rows, sorted/paged) | 1,603 | 106.7 | 183 | 214 | 231 | 257 | 0 | 1,603×200 |
| metrics | 2,466 | 164.1 | 117 | 131 | 151 | 162 | 0 | 2,466×200 |
| traffic (1 entry/report) | 2,231 | 148.4 | 132 | 153 | 168 | 186 | 0 | 2,231×201 |
| subscription (json) | 1,965 | 130.8 | 151 | 181 | 203 | 220 | 0 | 1,965×200 |

No socket errors, timeouts, 4xx (except the expected login 429s) or 5xx responses. Throughput and
all raw counters are in `bench/results/latest.json`.

## Interpretation

- The paged users list is the slowest endpoint (p50 183 ms, p97.5 231 ms) at 5,000 users. It runs a
  `count` plus a sorted `findMany` with a deterministic tie-breaker; p50 scales with table size.
  Tracked as issue #51 (no code change in this task).
- Metrics and subscription reads sit at ~117–151 ms p50; traffic writes at ~132 ms p50 with no
  errors, so the write path stays stable under sustained load in this environment.
- Login throughput is dominated by the route-level limiter (5 successful logins per minute per IP),
  not by Argon2/bcrypt verification: the handful of accepted logins completed in 23–78 ms.
- The in-process scale harness (`docs/runbooks/load-test.md`) measured p95 ~170 ms for paged reads
  and ~573 ms for 10-entry traffic reports on a different sandbox run. The numbers are not directly
  comparable (different host, 1 vs 10 entries, in-process vs HTTP), but neither run showed errors.

## Recommendations

1. Re-run the same scenarios from a host close to the deployed cluster and record p95/p99, error
   rate and container resource usage before the 5k/20-node rollout is signed off.
2. Keep the route-level login throttle in place; give clients/jobs a dedicated service path rather
   than raising the limit globally.
3. If paged user reads become a bottleneck, investigate a composite index on `(createdAt, id)` and a
   keyset-pagination variant instead of `OFFSET` (tracked in issue #51).

No product code, dependency versions or infrastructure manifests were changed by this task.
