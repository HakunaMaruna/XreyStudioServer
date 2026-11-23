# XreyStudioServer HTTP load harness

autocannon scenarios for the five endpoints called out in issue #42: login, paged user list,
metrics, node traffic report and subscription export. Results are written to
`bench/results/latest.json`; the interpreted report lives in
`docs/reports/performance-v1.8.3.md`.

## Prerequisites

- A running stack (local Compose or a deployed instance) and a disposable PostgreSQL database.
- Node.js 20+. Install the harness once:

```bash
cd bench
npm ci
```

## Prepare the target

The setup script logs in as the bootstrap admin, creates one node, one user and (optionally)
bulk-seeds users directly through the backend's Prisma client. It writes tokens to
`bench/results/context.json` (gitignored). The target database is TRUNCATE-free: use a dedicated
database because traffic reports add rows on every request.

```bash
cd backend
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_bench npm run prisma:generate
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_bench npx prisma db push --skip-generate

JWT_SECRET=bench-jwt-secret-at-least-32-chars \
ADMIN_PASSWORD=bench-admin-pass-123 \
ADMIN_EMAIL=admin@example.com \
METRICS_TOKEN=bench-metrics-token \
THROTTLE_LIMIT=100000 \
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_bench \
npm run start:prod
```

In another shell:

```bash
cd bench
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_bench \
BENCH_BASE_URL=http://127.0.0.1:3000 \
BENCH_ADMIN_EMAIL=admin@example.com \
BENCH_ADMIN_PASSWORD=bench-admin-pass-123 \
BENCH_METRICS_TOKEN=bench-metrics-token \
BENCH_USERS=5000 \
npm run setup
```

For a Compose stack use the published host/port instead of `http://127.0.0.1:3000` and set
`BENCH_ADMIN_*`/`BENCH_METRICS_TOKEN` to the values from `.env`. The backend must have been started
with a high `THROTTLE_LIMIT` so the global per-IP limiter does not dominate the results; the login
route has its own fixed `@Throttle({ limit: 5 })` and is expected to return 429s under load.

## Run

```bash
npm run run                 # all five scenarios, ~10 s each by default
npm run users               # one scenario (also: login, metrics, traffic, subscription)
BENCH_CONNECTIONS=50 BENCH_DURATION=60 BENCH_PIPELINING=4 npm run run
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCH_BASE_URL` | `http://127.0.0.1:3000` | target origin |
| `BENCH_DURATION` | `10` | seconds per scenario |
| `BENCH_CONNECTIONS` | `20` | concurrent connections |
| `BENCH_PIPELINING` | `1` | requests per connection in flight |
| `BENCH_USERS` | `5000` | user rows seeded by `npm run setup` |

Each scenario records total requests, requests/second, p50/p95/p99 latency, throughput, socket
errors/timeouts and HTTP status-code counts. `npm run run` writes all summaries to
`bench/results/latest.json`.

## Notes

- The subscription token is used in the request path; never commit `bench/results/context.json`.
- Numbers from localhost exclude DNS, Ingress and TLS overhead. Re-run from a host inside/near the
  cluster before signing off production capacity.
- The harness does not modify product code, package versions or infrastructure manifests.
