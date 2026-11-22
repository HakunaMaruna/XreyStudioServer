# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Current state (v1.1.1, 2026-11-22)

- Source of truth: `/work/XreyStudioServer` (working copy) and the git repo
  `/tmp/opencode/XSS_REPO` (remote: https://github.com/HakunaMaruna/XreyStudioServer).
- Published: commit `95cf23f`, tag/release `v1.1.1`, bundle `/work/XreyStudioServer/XSS_v1.1.1.bundle`.
  Previous release: `e309d28` / `v1.1.0`. GitHub description updated.
- Stack: NestJS + Prisma/PostgreSQL + Redis, Next.js 16 + React 19, Node agent, Caddy, Docker Compose.
- Backend modules: auth (JWT + refresh + RBAC), users, nodes, inbounds, hosts, rules, config
  generator (revisions/apply/rollback), subscriptions (raw/base64/clash/singbox/json),
  metrics (Prometheus text), payments (Stripe + signed webhook), notifications, organizations, audit.
- Frontend pages: login, dashboard, users, nodes, inbounds, settings, public `/sub/[token]`,
  i18n ru/en, dark/light theme. Tables use `@tanstack/react-table` via
  `frontend/src/components/data-table.tsx` (search, sort, pagination); dashboard uses Recharts;
  users page has an edit modal (`PATCH /api/users/:id`).
- Agent: config validation/apply/rollback/restart/metrics/pull, TLS/mTLS env options; detects a
  dual config (`{ xray, singbox }`), validates each engine and restarts xray/sing-box services.

## Environment constraints (important)

- `/work` does NOT support symlinks or git objects. `npm install` fails there when creating
  `node_modules/.bin` symlinks; git commands must run in `/tmp/opencode/XSS_REPO`.
- To validate, copy the relevant project into `/tmp/opencode/xss-check` (backend) or
  `/tmp/opencode/xss-check-fe` (frontend), `npm ci` there, then run commands.
- Validation already performed: backend `npm run typecheck`, `npm run lint`,
  `npm test -- --runInBand` (7 tests), `npm run build`; frontend `npm run lint`, `npm run build`;
  `node --check agent/src/index.js`. All passed after the v1.1.1-stage changes.
- Docker is not installed in this environment, so `docker compose build` cannot be run locally
  (CI performs it). Node here is v20.15.1; Next 16 wants >=20.19, but the production build passed.
- GitHub push works via the credential store in `/root/.git-credentials`.

## Done in v1.1.0

- Fixed stray `EOF`/`echo done` lines in `docker-compose.yml` (file was invalid).
- Stripe webhook signature verification (raw body, HMAC-SHA256, 5-minute tolerance, idempotent
  `markPaid`), `STRIPE_WEBHOOK_SECRET` in `.env.example`.
- Stricter rate limits on `POST /auth/login` (5/min) and `/auth/refresh` (10/min); configurable
  global `THROTTLE_TTL`/`THROTTLE_LIMIT`.
- Backup/restore scripts (`scripts/backup.sh`, `scripts/restore.sh`, `make backup/restore`, `BACKUP_KEEP`).
- Prometheus + Grafana under the `monitoring` Compose profile (`make monitoring`), dashboard
  `monitoring/grafana/dashboards/xss-overview.json`.
- Fixed build blockers: JSX closing tag and `useParams` on subscription page, `api.get` signature,
  duplicate `base64` method, Prisma JSON typing in audit, `require()` in agent-client, `prefer-const`.
- Added backend ESLint config, unit tests for webhook verification, lockfiles for both apps,
  CI runs lint/typecheck/tests/build, bilingual docs updated.

## Done after v1.1.0 (stage for v1.1.1)

- UI: TanStack Table on users/nodes/inbounds, user edit modal, Recharts pie/bar charts on
  dashboard, new i18n keys ru/en, validation on forms.
- `k8s/`: Kustomize manifests (namespace, config/secret, PostgreSQL StatefulSet, Redis, backend
  with `prisma db push` init container, frontend, agent, Ingress) plus `k8s/README.md`.
  Image tags in manifests are `1.1.1`.
- Protocol adapters: `hysteria2`/`tuic` users and `wireguard` peers become a sing-box config in
  `ConfigGeneratorService.buildSingbox()`; Xray protocols stay in the Xray config. The agent
  handles `{xray, singbox}` payloads (`applyXrayConfig` / `applySingboxConfig`). Subscription
  links, Clash and sing-box exports support all three protocols. Added 2 unit tests (7 total).

## Remaining plan (next work)

1. **Production hardening leftovers**: Grafana alerting rules and a cron example for scheduled
   backups; optional Argon2id password hashing.
2. **UI completeness**: CRUD forms for hosts/rules and a config revision/rollback screen;
   server-side filtering/pagination for large user lists (the API already supports `page`/`limit`).
3. **Validation**: `docker compose config`/`kubectl apply --dry-run=client` and image builds when
   Docker/kubectl are available in the environment; end-to-end API tests with a test database.
4. After each change: sync edited files into `/tmp/opencode/XSS_REPO`, commit, push, update
   README (ru/en), docs and this HANDOFF file. Tag a new release when the stage is complete.

## Commands

```bash
trail build /work/XreyStudioServer            # refresh code map into graft/
trail ask "where is Stripe webhook verified" /work/XreyStudioServer
trail note --title "..." -m "..." /work/XreyStudioServer

# backend validation (in /tmp/opencode/xss-check)
npm run typecheck && npm run lint && npm test -- --runInBand && npm run build
# frontend validation (in /tmp/opencode/xss-check-fe)
npm run lint && npm run build

# git (in /tmp/opencode/XSS_REPO)
git add -A && git commit -m "..." && git push origin main
```
