# Load and soak baseline (5k users / 20 nodes)

The scale check seeds a dedicated PostgreSQL database with 5,000 users and 20 registered nodes,
then measures paginated user reads and concurrent node traffic writes. It is a reproducible
regression baseline for the target scale, not a substitute for a real-cluster rollout test.

## Run

Use a disposable database — the check TRUNCATEs all application tables before and after the run.

```bash
cd backend
npm ci
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:scale:pg
```

Environment overrides:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCALE_USERS` | `5000` | users created directly via Prisma (fast bulk insert) |
| `SCALE_NODES` | `20` | nodes registered through `POST /api/nodes` |
| `SCALE_READ_REQUESTS` | `100` | `GET /api/users` requests (paging, sorting and search) |
| `SCALE_TRAFFIC_ROUNDS` | `1` | rounds of traffic reports; raise for a soak run |
| `SCALE_ENTRIES_PER_NODE` | `10` | traffic entries per node per round |
| `SCALE_CONCURRENCY` | `8` | concurrent user-read requests |
| `SCALE_P95_LIMIT_MS` | `0` | optional p95 budget in ms; `0` disables the assertion |

Example soak run (20 minutes of traffic reports, 50 users, 4 nodes):

```bash
SCALE_USERS=50 SCALE_NODES=4 SCALE_READ_REQUESTS=200 \
  SCALE_TRAFFIC_ROUNDS=120 SCALE_ENTRIES_PER_NODE=50 \
  SCALE_P95_LIMIT_MS=1000 npm run test:scale:pg
```

## Output and interpretation

The test prints `p50`, `p95`, `p99`, `max` and requests/second for both phases and fails on any
HTTP error, a wrong result count, or a p95 above `SCALE_P95_LIMIT_MS` (when set). It also asserts
the paginated result set contains all seeded users and that every traffic entry was persisted.

Requests go through Nest's in-process HTTP server with supertest, so latency excludes network,
Ingress, TLS and proxy overhead. Use the numbers to detect backend/query regressions; validate
production readiness separately with a real cluster (pod rollout, in-cluster DNS `backend:3000`,
`xss-backend-down` alert, Grafana ingress/TLS).
