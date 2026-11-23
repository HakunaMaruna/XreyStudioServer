# Post-dependency regression verification (v1.8.3 dependency updates)

Scope: confirm that the v1.8.3 dependency updates (express 5 in the agent, ESLint 10, Tailwind
4.3.5, @types/node 26, dotenv 18, @eslint/js 10) did not break the release. The checks below were
run on 2026-11-23 against `main` at `15da624` (the v1.8.4 content; v1.8.3 updates plus subsequent
merges). While the work was in progress `origin/main` advanced to `70bf5ac` (v1.8.5); the
real-PostgreSQL e2e suite was re-run there and exposed a new regression, tracked as issue #52 (see
below). Product code was not changed as part of this verification (issue #41).

## Environment

| Component | Local value | CI value |
| --- | --- | --- |
| Node.js | v20.15.1 (musl, aarch64) | `setup-node@v4` with `node-version: 20` (20.19+) |
| npm | bundled with v20.15.1 | bundled with CI Node 20 |
| PostgreSQL | 16, local cluster `xss_e2e` | postgres:16-alpine service container |
| Docker / Compose | not installed in the sandbox | `docker compose build` job |
| Helm / kubectl | not installed in the sandbox | `.github/workflows/infra.yml` |

## Commands and results

All commands were run from `/tmp/opencode/XSS_REPO` (the source-of-truth checkout) on 2026-11-23.

| Check | Command | Result |
| --- | --- | --- |
| Backend typecheck | `cd backend && npm run typecheck` | pass |
| Backend lint | `cd backend && npm run lint` | pass: 0 errors, 84 warnings (pre-existing `no-explicit-any`) |
| Backend unit tests | `cd backend && npm test -- --runInBand` | pass: 3 suites, 10 tests |
| Backend build | `cd backend && npm run build` | pass |
| Backend mock e2e + compiled-main smoke | `cd backend && npm run test:e2e` | pass: 2 suites, 11 tests (`app.e2e-spec.ts`, `compiled-main.e2e-spec.ts`) |
| Backend real-PostgreSQL e2e | `DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:e2e:pg` | pass on `15da624`: 2 suites, 12 tests; **fails on `70bf5ac`**: 2 tests (issue #52) |
| Frontend lint | `cd frontend && npm run lint` | pass: 0 errors, 95 warnings (pre-existing) |
| Frontend build | `cd frontend && npm ci && npm run build` | **locally blocked** — see below; CI passes |
| Agent express 5 smoke | local install + start with `AGENT_SECRET`, then curl `/health`, `/logs`, `/config` | pass — see below |
| Docker Compose build | `docker compose build` | not available locally; CI job passes |
| Helm lint / template | `helm lint ./helm/xrey` | not available locally; CI job defined in `infra.yml` (not triggered for this commit — no infra paths changed) |

CI cross-check for the same commit: [run 45217111138](https://github.com/HakunaMaruna/XreyStudioServer/actions/runs/45217111138)
(all backend, frontend, e2e-postgres and docker jobs green) and
[run 45220154854](https://github.com/HakunaMaruna/XreyStudioServer/actions/runs/45220154854).
The frontend job log of the first run shows `next build` compiling in 5.8 s and generating all
21 routes; `npm ci` installed 400 packages. The CI `docker compose build` job also completed
successfully, so the image builds did not regress. On the newer `70bf5ac` commit the CI
`e2e-postgres` job failed (2 tests), matching the local re-run; all other jobs on that commit were
green. This failure is not related to the v1.8.3 dependency updates.

## Agent smoke test details

The agent was installed into a scratch directory with `npm install` (resolved `express@5.3.0`,
`dotenv@18.0.10`, 0 vulnerabilities) and started with `PORT=19090`, `AGENT_SECRET=smoke-secret`,
`PANEL_URL=http://127.0.0.1:1`, `XRAY_CONFIG_PATH` pointing at a scratch file and `XRAY_BIN=/bin/true`.
The periodic panel calls failed as expected against the unreachable `PANEL_URL` and did not affect
the HTTP endpoints:

| Request | Result |
| --- | --- |
| `GET /health` | `200 {"status":"ok","nodeId":"smoke-node",...}` |
| `GET /logs` without secret | `403 {"error":"Forbidden"}` |
| `GET /logs?lines=5` with `x-agent-secret` | `200`, `source: "unavailable"` (no journalctl in the sandbox) |
| `POST /config` with secret and `{"inbounds":[],"outbounds":[]}` | `200 {"applied":true,"reloaded":false}` (no systemctl in the sandbox) |

No express 5 route or JSON-body regression was observed.

## Local frontend build limitation (not a release regression)

`npm ci && npm run build` fails on this sandbox regardless of the Node binary used:

```
Turbopack build failed with 1 error:
./src/app/globals.css
Error: Error evaluating Node.js code
Error: require() of ES Module .../node_modules/magic-string/dist/index.mjs not supported.
  (from .../node_modules/@tailwindcss/turbopack/dist/index.js)
```

The lockfile pins `@tailwindcss/turbopack@4.3.5` and `magic-string@1.4.5` (ESM-only). The pinned
combination builds successfully in GitHub Actions with the same lockfile (see the CI log above).
The failure is specific to Turbopack's embedded Node.js evaluation on this musl/proot sandbox;
`require('magic-string')` itself works with Node 20.19.5 here. No product-code change is warranted,
so no regression issue was filed for it. If a real CI frontend job ever fails with this error,
pinning `magic-string` to a CJS-compatible version in the frontend lockfile is the first thing to try.

## Regressions found

- Issue #52: on `70bf5ac` (v1.8.5), `GET /api/subscriptions/:token?format=json` returns 403 for an
  exceeded subscription, so two PostgreSQL e2e tests fail. Introduced after the checks above by the
  v1.8.5 subscription response changes; reproduced locally and in CI. No code was changed here.

## Conclusion

No regressions were found in the v1.8.3 dependency updates themselves. The remaining unchecked
items are the Docker Compose image build and Helm chart validation, both covered by CI in a normal
runner, and the local-only frontend build limitation described above. Issue #52 must be resolved
before the current `main` can be considered green.
