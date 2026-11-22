# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Current state (v1.2.0, 2026-11-22)

- Source of truth: `/work/XreyStudioServer` (working copy) and the git repo
  `/tmp/opencode/XSS_REPO` (remote: https://github.com/HakunaMaruna/XreyStudioServer).
- Published: tag/release `v1.2.0`, release commit `89add5e`, bundle `/work/XreyStudioServer/XSS_v1.2.0.bundle`.
  Previous releases: `v1.1.1` (UI tables/charts, k8s, protocol adapters), `v1.1.0`, `v1.0.0`.
- Stack: NestJS + Prisma/PostgreSQL + Redis, Next.js 16 + React 19, Node agent, Caddy, Docker Compose.
- Backend modules: auth (JWT + refresh + RBAC + Argon2id/bcrypt), users, nodes, inbounds, hosts,
  rules, config generator (revisions/apply/rollback), subscriptions (raw/base64/clash/singbox/json),
  metrics (Prometheus text), payments (Stripe + signed webhook), notifications (Telegram/webhook +
  token-protected Grafana alert receiver), organizations, audit.
- Frontend pages: login, dashboard, users, nodes (with config revision modal), inbounds, hosts,
  rules, settings, public `/sub/[token]`; i18n ru/en, dark/light theme. Tables use
  `@tanstack/react-table` via `frontend/src/components/data-table.tsx`; the users page uses
  server-side search/filter/pagination (`page`, `limit`, `search`, `status`, `role`).
- Agent: config validation/apply/rollback/restart/metrics/pull, TLS/mTLS env options; detects a
  dual config (`{ xray, singbox }`), validates each engine and restarts xray/sing-box services.

## Environment constraints (important)

- `/work` does NOT support symlinks or git objects. `npm install` fails there when creating
  `node_modules/.bin` symlinks; git commands must run in `/tmp/opencode/XSS_REPO`.
- To validate, copy the relevant project into `/tmp/opencode/xss-check` (backend) or
  `/tmp/opencode/xss-check-fe` (frontend), `npm ci` there, then run commands.
- Docker/kubectl are not installed here, so image builds and `kubectl apply --dry-run` cannot be
  run locally (CI builds the images). Node here is v20.15.1; Next 16 wants >=20.19, but the
  production build passed.
- GitHub push works via the credential store in `/root/.git-credentials`.

## Done in v1.2.0

- Argon2id password hashing (`@node-rs/argon2`, OWASP parameters) via a global `PasswordService`
  shared by auth, users and seed. Legacy bcrypt hashes are verified transparently;
  `PASSWORD_HASHER=bcrypt` keeps new hashes bcrypt. Added a unit spec.
- Grafana alerting: file-provisioned contact point, notification policy and 4 alert rules
  (`monitoring/grafana/provisioning/alerting/alerts.yml`); alerts POST to
  `POST /api/notifications/alerts` with `Authorization: Bearer $ALERT_WEBHOOK_TOKEN` and are
  forwarded to Telegram. Docs: `docs/monitoring.md`.
- Scheduled backups: `docs/backup.md` with cron/`flock` examples, `BACKUP_DIR` variable.
- UI: full CRUD pages for hosts and rules, config revision browser with apply/rollback on the
  nodes page, server-side search/status/role filters and pagination on the users page.
  `DataTable` supports `serverPagination` and `hideSearch`.
- E2E API suite (`backend/test/app.e2e-spec.ts`, `npm run test:e2e`) boots the app with a mocked
  PrismaService: login, validation, user paging, host/rule CRUD, revisions, alert webhook auth.
- Bumped versions to 1.2.0 (package.json, Swagger, k8s image tags), updated README ru/en,
  docs/api.md, docs/install.md, docs/architecture.md, k8s/README.md, .env.example.

## Remaining plan (next work)

1. E2E tests against a disposable real PostgreSQL instance (CI service container).
2. Client-side column sorting combined with server-side user paging (currently sorting disabled
   on the users table because the API always orders by `createdAt desc`).
3. Email/Signal notification channels and an in-app alert history.
4. After each change: sync edited files into `/tmp/opencode/XSS_REPO`, commit, push, update
   README (ru/en), docs and this HANDOFF file. Tag a new release when the stage is complete.

## Commands

```bash
trail build /work/XreyStudioServer            # refresh code map into graft/
trail ask "where is Stripe webhook verified" /work/XreyStudioServer
trail note --title "..." -m "..." /work/XreyStudioServer

# backend validation (in /tmp/opencode/xss-check)
npm run typecheck && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e
# frontend validation (in /tmp/opencode/xss-check-fe)
npm run lint && npm run build

# git (in /tmp/opencode/XSS_REPO)
git add -A && git commit -m "..." && git push origin main
```
