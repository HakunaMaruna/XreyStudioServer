# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Current state (v1.5.0, 2026-11-23)

- Source of truth: `/work/XreyStudioServer` (working copy) and the git repo
  `/tmp/opencode/XSS_REPO` (remote: https://github.com/HakunaMaruna/XreyStudioServer).
- Published: tag/release `v1.5.0`,
  https://github.com/HakunaMaruna/XreyStudioServer/releases/tag/v1.5.0,
  bundle `/work/XreyStudioServer/XSS_v1.5.0.bundle` (attached to the release).
  Previous releases: `v1.4.1` (quota status hotfix), `v1.4.0` (traffic, logs, admin UI), `v1.3.0` (notifications, alert history,
  sorting, real PostgreSQL e2e), `v1.2.0`, `v1.1.1`, `v1.1.0`, `v1.0.0`.
- Stack: NestJS + Prisma/PostgreSQL + Redis, Next.js 16 + React 19, Node agent, Caddy, Docker Compose.
- Backend modules: auth (JWT + refresh + RBAC + Argon2id/bcrypt), users, nodes, inbounds, hosts,
  rules, config generator (revisions/apply/rollback), subscriptions (raw/base64/clash/singbox/json),
  metrics (Prometheus text), payments (Stripe + signed webhook), notifications (Telegram/webhook/
  SMTP/Signal + token-protected Grafana alert receiver + `AlertHistory` persistence), organizations,
  audit, traffic (per-user reports + quota enforcement).
- Frontend pages: login, dashboard, users, nodes (revision + log modals), inbounds (with edit modal),
  hosts, rules, alerts, audit, organizations, payments, plans, settings, public `/sub/[token]`
  (with QR code); i18n ru/en, dark/light theme.
  Tables use `@tanstack/react-table` via `frontend/src/components/data-table.tsx`; the users page
  uses server-side search/filter/sorting/pagination (`page`, `limit`, `search`, `status`, `role`,
  `sortBy`, `sortOrder`) and controlled sorting via `sorting`/`onSortingChange`/`manualSorting`.
- Agent: config validation/apply/rollback/restart/metrics/pull/logs, TLS/mTLS env options; detects a
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

## Done in v1.5.0

- Backups UI/API: new `BackupsModule` (ADMIN only) with `GET/POST /api/backups`,
  `GET /api/backups/:name/download`, `DELETE /api/backups/:name` and
  `POST /api/backups/:name/restore` (`{ confirm: true }`). `pg_dump | gzip` snapshots in `BACKUP_DIR`
  with `BACKUP_KEEP` retention, strict `db-YYYYMMDD-HHMMSS.sql.gz` names, restore via `psql`, audit
  log entries; `postgresql-client` installed in the backend image and `./backups` mounted into the
  container by Compose. Frontend page `/backups` plus nav/i18n entries; CLI scripts still work.
- Reporting: `GET /api/traffic/chart?userId=&days=1..90` (daily UTC buckets, byte strings), CSV
  exports for traffic, audit and payments (`/api/*/export.csv`, 10 000-row cap, formula-injection
  escaping in `common/csv.ts`), `/traffic` page with a recharts LineChart, user filter and CSV
  button; Export CSV buttons on `/audit` and `/payments`. `api.download`/`api.downloadCsv` helpers.
- Redis rate limiting: `common/redis-throttler.storage.ts` implements `ThrottlerStorage` using
  ioredis (`REDIS_URL`, key prefix `xss:throttle:`), with in-memory fallback when Redis is unset or
  down; wired into `ThrottlerModule.forRoot`. `REDIS_URL` added to `.env.example`.
- Kubernetes monitoring: `k8s/monitoring.yaml` (Prometheus + Grafana Deployments/Services) and
  `k8s/generate-monitoring.mjs` producing `k8s/monitoring-config.yaml` from `monitoring/`;
  both added to `kustomization.yaml`, `make k8s-monitoring` target, k8s README instructions.
- Docs updated: README ru/en, `docs/{api,backup,install,monitoring,architecture}.md`, `k8s/README.md`,
  `.env.example`. Versions bumped to 1.5.0 (package.json + locks, Swagger, k8s image tags).

## Done in v1.4.1

- Hotfix: subscription status now reports `exceeded` before checking `status === EXPIRED`, so a
  quota-triggered expiry is distinguishable from an admin-set expiry (the real-PostgreSQL e2e
  failure in v1.4.0). Versions bumped to 1.4.1.

## Done in v1.4.0

- Per-user traffic: `UserTraffic` model + `TrafficModule`; `POST /nodes/:id/traffic` (node token)
  accepts `{ entries: [{ subscriptionToken|userId|email, up, down }] }`, writes rows, increments
  `User.trafficUsed` and sets status `EXPIRED` when the limit is reached. `GET /traffic` exposes
  paged history with byte totals. Subscription config exports return 403 for `exceeded`;
  `getStatus()` can report `exceeded`, and `refresh` now checks expiry too.
- Node logs: agent `GET /logs?service=xray|singbox&lines=N` (journalctl with `XRAY_LOG_PATH` /
  `SINGBOX_LOG_PATH` file fallback), panel proxy `GET /nodes/:id/logs` and a log viewer modal.
- Plans and payments: `Payment.planId`, optional `planId` on `POST /payments`, `PATCH /payments/plans/:id`,
  and automatic provisioning on `markPaid` (ACTIVE, traffic reset, new `expiresAt`). UI pages for
  payments and plans.
- More admin UI: audit log filtering, organizations CRUD, inbound edit modal, navigation links and
  i18n keys.
- Dockerfiles use `npm ci` with `.dockerignore` files; versions bumped to 1.4.0.
- E2E coverage: mock suite tests traffic reporting and plan provisioning; real-PostgreSQL suite
  verifies quota enforcement and paid-plan activation.

## Done in v1.3.0

- Notification channels: real SMTP email via nodemailer (`SMTP_*`, `EMAIL_FROM`, `ALERT_EMAIL_TO`),
  Signal via `signal-cli-rest-api` (`SIGNAL_API_URL`/`SIGNAL_PHONE_NUMBER`/`SIGNAL_RECIPIENT`),
  generic webhook and Telegram unified in `NotificationsService.broadcast()`, plus a
  `GET /notifications/channels` status endpoint (no secrets exposed).
- Alert persistence: new `AlertHistory` Prisma model; every Grafana alert is stored with
  status/title/message/severity/labels and exposed through `GET /notifications/alerts`
  (paged, status filter) and the new `/alerts` admin page with a channel overview.
- Users API sorting: whitelisted `sortBy`/`sortOrder` applied in SQL before pagination with a
  deterministic `id` tie-breaker; the users table sends sort state to the API (manual sorting in `DataTable`).
- QR code on the public subscription page via `qrcode.react`.
- E2E against real PostgreSQL: `backend/test/postgres.e2e-pg-spec.ts`, `test/jest-e2e-pg.json`,
  `npm run test:e2e:pg` (pushes the schema and runs the suite). CI gained a PostgreSQL 16 service
  container job and now also runs the mock e2e suite; both e2e configs have a 30s timeout.
- Bumped versions to 1.3.0 (backend/frontend/agent package.json + locks, Swagger, k8s image tags),
  updated README ru/en, docs/api.md, docs/monitoring.md, .env.example.
- Follow-up CI fix: Dockerfiles use `npm ci` without `--no-bin-links`, so `next`/`nest` binaries
  exist in the images and the `docker compose build` job passes.

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

1. Backup schedules and retention policies configurable from the UI.
2. Organization-level and per-protocol reporting.
3. Helm chart / integration with an existing Prometheus Operator.
4. After each change: sync edited files into `/tmp/opencode/XSS_REPO`, commit, push, update
   README (ru/en), docs and this HANDOFF file. Tag a new release when the stage is complete.

## Commands

```bash
trail build /work/XreyStudioServer            # refresh code map into graft/
trail ask "where is Stripe webhook verified" /work/XreyStudioServer
trail note --title "..." -m "..." /work/XreyStudioServer

# backend validation (in /tmp/opencode/xss-check)
npm run typecheck && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:e2e:pg
# frontend validation (in /tmp/opencode/xss-check-fe)
npm run lint && npm run build

# git (in /tmp/opencode/XSS_REPO)
git add -A && git commit -m "..." && git push origin main
```
