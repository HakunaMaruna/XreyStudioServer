# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Current state (v1.3.0, 2026-11-22)

- Source of truth: `/work/XreyStudioServer` (working copy) and the git repo
  `/tmp/opencode/XSS_REPO` (remote: https://github.com/HakunaMaruna/XreyStudioServer).
- Published: tag/release `v1.3.0`, release commit `55a5698`,
  https://github.com/HakunaMaruna/XreyStudioServer/releases/tag/v1.3.0,
  bundle `/work/XreyStudioServer/XSS_v1.3.0.bundle`.
  Previous releases: `v1.2.0` (Argon2id, Grafana alerts, admin CRUD, server paging),
  `v1.1.1` (UI tables/charts, k8s, protocol adapters), `v1.1.0`, `v1.0.0`.
- Stack: NestJS + Prisma/PostgreSQL + Redis, Next.js 16 + React 19, Node agent, Caddy, Docker Compose.
- Backend modules: auth (JWT + refresh + RBAC + Argon2id/bcrypt), users, nodes, inbounds, hosts,
  rules, config generator (revisions/apply/rollback), subscriptions (raw/base64/clash/singbox/json),
  metrics (Prometheus text), payments (Stripe + signed webhook), notifications (Telegram/webhook/
  SMTP/Signal + token-protected Grafana alert receiver + `AlertHistory` persistence), organizations,
  audit.
- Frontend pages: login, dashboard, users, nodes (with config revision modal), inbounds, hosts,
  rules, alerts, settings, public `/sub/[token]` (with QR code); i18n ru/en, dark/light theme.
  Tables use `@tanstack/react-table` via `frontend/src/components/data-table.tsx`; the users page
  uses server-side search/filter/sorting/pagination (`page`, `limit`, `search`, `status`, `role`,
  `sortBy`, `sortOrder`) and controlled sorting via `sorting`/`onSortingChange`/`manualSorting`.
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

1. Per-user traffic accounting derived from node metrics, with quota enforcement.
2. UI for audit logs, organizations, payments and subscription plans.
3. Node log viewer, inbound editing, backup automation in the UI.
4. Broader Redis usage (rate limiting/cache) and validation of the monitoring stack in k8s.
5. After each change: sync edited files into `/tmp/opencode/XSS_REPO`, commit, push, update
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
