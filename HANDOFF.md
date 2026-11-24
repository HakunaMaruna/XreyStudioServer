# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

> **Для следующих код-агентов (2026-11-24):** работа по v2.23.3 и AdminLTE завершена и запушена.
> main = `1ec678e`, тег/релиз `v2.23.3` опубликован, CI/Images/Live API smoke зелёные.
> Event-level notification routing (PR #165, `59a8e5e`) доделан; AdminLTE — дефолтный UI
> (PR #164), все 21 страница и общие компоненты покрыты, awful Aurora оставлен намеренно
> (`NEXT_PUBLIC_UI=aurora`). Документация обновлена, подписи переключателя локализованы.
> Локальные ограничения: Turbopack `next build` падает только на Node 20.15 (ESM
> `magic-string`) — используйте `npx next build --webpack`; v15 pg e2e пропущен из-за
> pg_dump 16 vs PGlite 19 (в CI проходит). `/work` чистый; proot блокирует запись объектов
> git — синхронизируйте копированием loose objects из `/tmp/opencode/xss-work-225`.

## Latest (v2.9.0 – v2.17.1, 2026-11-24)

- Live panel: `https://msc.h2onetwork.pro` (current tag v2.17.1, `/api/health` 200, login 201).
  Node geo report works: `RU / Moscow / 213.171.30.186 / AS208677`, visible in the nodes table.
  VPN tunnel re-verified after all deploys: `httpbin.org/get` and `api.ipify.org` through the
  subscription returned `213.171.30.186` (not the local direct IP).
  MCP bridge at `/api/mcp` works with `MCP_TOKEN` from `.env` (documented in `docs/mcp.md`).
- **Real VPN test connection** is set up: `docs/test-connection.md` contains the subscription URL
  and import instructions. The agent image now includes Xray 26.11.9 and runs it as a managed
  child process (no systemd), with ports 2053 (VMess) and 2054 (VLESS Reality) published.
  End-to-end test from another machine: `httpbin.org/get` through the tunnel returned
  `origin: 213.171.30.186` (local direct IP was different) — traffic really exits via the server.
  Server: `ssh user1@213.171.30.186` with `~/.ssh/id_xss_server`; deploy from `/home/user1/xss`
  via `git reset --hard origin/main` + `docker compose up -d --build backend frontend agent`,
  followed by `npx prisma db push --skip-generate` and a backend restart when the schema changes.
- Releases: v2.9.0 HWID device limits; v2.9.1 DI fix; v2.10.0 client-eye health checks;
  v2.11.0 branded subscription templates; v2.12.0 accessibility fixes + real active-connection
  counting in the agent; v2.13.0 geosite/geoip catalog browser.
- New modules: `devices`, `health-checks`, `subscription-templates`, `geodata`.
  New pages: `/health-checks`, `/subscription-templates`, `/geodata`.
- Agent-review findings (PR #100, `docs/reports/ux-review-v2.8.md`) were fixed in v2.12.0:
  dialog semantics/focus trap, label↔input association, `role=switch`, page titles, skip link,
  search/password aria-labels, WCAG AA contrast.
- Delegated agents: #92/#107 (QA, PR #96/#94/#97/#120/#121/#123), #93 (UX report, PR #100) and
  #95 (SSH node onboarding, PR #103/#110) are closed/merged. Active: #108 (UX re-review),
  #109 (canary rollout), #125 (QA for MCP/Xray).
- v2.15.x: Xray runs inside the agent container, Xray 26 `statsquery` support, managed-restart
  race fixed, VLESS Reality test port added.
- v2.16.0: security hardening (tenant isolation for inbounds, SSRF guards in agent-client,
  OPERATOR cannot modify ADMIN, METRICS_TOKEN required in prod, traffic scoped to node org).
  Security re-audit findings #137–#140 closed.
- v2.17.x: node exit-IP geocheck with retry on startup; agent 4's `add-node.sh` JSON parsing
  hardened (PR #146). Open agent tasks: #145 (agent 2 QA), #148 (agent 4 canary rollouts).
- Blocked: per-node Let's Encrypt needs a wildcard DNS record `*.msc.h2onetwork.pro`
  pointing at `213.171.30.186` (user action).
- Still in the plan: decoy sites, canary rollouts, MCP bridge, tunnel sidecars (AmneziaWG /
  NaiveProxy / mieru).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Historical state (v2.6.0, 2026-11-24)

- Source of truth: the git repo `/tmp/opencode/XSS_REPO`
  (remote: https://github.com/HakunaMaruna/XreyStudioServer). `/work/XreyStudioServer` is a
  synced working copy for local inspection and `trail` commands, not an independent source.
- Published: tag/release `v2.6.0`,
  https://github.com/HakunaMaruna/XreyStudioServer/releases/tag/v2.6.0.
  Previous releases: `v2.3.0` (structured inbound settings), `v2.2.0`, `v2.1.0`.
  Earlier: `v1.4.1` (quota hotfix), `v1.4.0` (traffic/logs/admin UI), `v1.3.0`, `v1.2.0`, `v1.1.x`, `v1.0.0`.
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
- kind/k3s cannot run in this sandbox (`CapEff=0`, no `/dev/shm`); cluster rollout, in-cluster
  DNS (`backend:3000`), the `xss-backend-down` rule and Grafana ingress/TLS need a real cluster.
  Local PostgreSQL 16 works with `LD_PRELOAD=/tmp/opencode/libshmshim.so`, run as user `postgres`
  with PGDATA `/tmp/opencode/pgdata-e2e`.
- GitHub push works via the credential store in `/root/.git-credentials`.

## Done in v1.8.3

- Triaged all 17 dependabot PRs. Merged 10: GitHub Actions (metadata-action 6, build-push-action 7,
  setup-buildx 4, setup-kubectl 5, action-gh-release 3), @types/supertest 7, tailwind turbopack 4.3.5,
  eslint 10, dotenv 18, plus @types/node 26, tailwindcss 4.3.5 and express 5.3.0 applied in PR #38
  after their branches conflicted with other lockfile merges.
- Closed 5 dependency PRs whose CI fails and need a coordinated migration: @nestjs/common 12,
  @nestjs/passport 12, @tanstack/react-table 9 and TypeScript 7.
- No open PRs or issues remain. Versions bumped to 1.8.3.

## Done in v2.6.0

- Added Xray listener protocols socks/http/mixed/dokodemo-door with per-inbound account selection;
  subscription links generated for these protocols.
- Routing profiles API and page for managing routing/geodata rule sets (JSON payloads).
- Ideas inspired by lucx-ui/remnawave, implemented independently (both are copyleft licensed).
- Version 2.6.0 across artifacts.

## Done in v2.5.0

- User onboarding UX: `GET /users/:id` now returns subscription URL, key and per-format links.
  Users page has a key button with copy-to-clipboard and attach-to-inbound flow.
- Panel settings: `GET/PATCH /api/settings` (ADMIN only) persisted in `backups/panel-settings.json`;
  Settings page now edits language, theme, notification toggles, metrics, rate limit, CORS and
  session length.
- Agents split: #79 (agent 2 — E2E/QA), #80 (agent 3 — UX/a11y review).

## Done in v2.4.0

- Fallbacks: `InboundFallback` model and UI editor allow multiple protocols on one TLS port.
- Per-client limits: `InboundClient` model with per-user traffic limit, expiry, enabled flag,
  comment and subscription sort order. Generator excludes disabled/expired/over-quota clients.
- Inbound expiry also clears generated clients. Version 2.4.0 across artifacts.

## Done in v2.3.0

- Expanded inbound settings inspired by 3x-ui feature set (independently implemented; 3x-ui is
  GPL-3.0, no code copied): listen address, transport/security, flow/path/SNI/serviceName,
  per-inbound traffic limit and expiry, traffic reset schedule and day, advanced JSON settings.
- Config generator now uses the structured fields for `streamSettings`, client flow and listen.
- Inbound create/edit modal reorganized into Basic / Transport & Security / Limits / Advanced.
- docs/api.md updated; version 2.3.0 across artifacts.

## Done in v2.2.0

- One-command installer with a colored terminal menu and language selection (EN/RU) before install.
- Non-interactive flags: `--mode`, `--domain`, `--lang`, `--yes`, `--dry-run`.
- Installer generates secrets, validates DNS, shows a summary and prints final credentials.
- README RU/EN and docs/install.md updated; version 2.2.0 across artifacts.

## Done in v2.1.0

- Restored the proven original dark SaaS admin design (from v1.9.0) after the Tabler experiment
  produced a broken/cramped layout locally. Business logic and all v1.9.0 features are intact.
- Tabler artifacts (`@tabler/core`, Tabler-specific classes) removed from the frontend.

## Done in v2.0.0

- Full admin UI migration to **Tabler** (`@tabler/core`): Tabler CSS replaces Tailwind preflight,
  shell/cards/tables/forms/buttons use Tabler classes, login screen uses Tabler auth layout.
  Business logic, API and i18n are unchanged.
- Added explicit ownership lanes for the two coding agents; tasks tracked via GitHub issues #66/#67.
- Versions bumped to 2.0.0 across packages, Swagger, k8s, Helm and the frontend constant.

## Done in v1.9.0

- Automatic Let's Encrypt certificates for nodes: HTTP-01 challenge served by Caddy webroot,
  per-node hostname `node-<id>.<suffix>`, certificate issuance/push endpoints and an agent
  `/certificate` endpoint that installs the cert and switches to HTTPS.
- Compose volumes for the ACME webroot and certificate storage; `certbot` added to the backend image.
- Note: requires a DNS record `*.nodes.<domain>` pointing at the panel IP and `NODE_DOMAIN_SUFFIX`
  set. Without DNS control, ACME DNS-01 is not used.

## Done in v1.8.6

- Fixed container startup on modern Alpine: Prisma client now generates the
  `linux-musl-openssl-3.0.x` engine and the backend image installs `openssl` explicitly. Without
  this, `PrismaClientInitializationError: libssl.so.1.1 not found` prevented the API from starting.

## Done in v1.8.5

- MEDIUM audit findings: `/users/:id` restricted to ADMIN/OPERATOR, OPERATOR can no longer set or
  move `organizationId`, cross-tenant reports/audit/traffic/payments restricted to ADMIN.
- Agent URL validation blocks private networks by default (`ALLOW_PRIVATE_AGENT_URLS` for local dev),
  metrics token compared in constant time, `/metrics/view` admin proxy replaces the public
  `NEXT_PUBLIC_METRICS_TOKEN`, subscription responses set `Cache-Control: no-store`.

## Done in v1.8.4

- Fixed HIGH audit findings: secrets are now required outside explicit `development`/`test`;
  Compose sets `NODE_ENV=production` by default; agent port is bound to localhost only and the
  default agent token was replaced with a placeholder; agent token comparison uses
  `timingSafeEqual`; generated node configs only include users from the node's organization.
- `security/AUDIT.md` added with the full read-only audit; issues #43–#47 track remaining findings.

## After v1.8.4 (on main, not yet tagged)

- Added `backend/test/scale.pg-spec.ts` + `jest-scale-pg.json`, `npm run test:scale:pg`, and
  `docs/runbooks/load-test.md`. The check seeds 5k users / 20 nodes in a real PostgreSQL DB,
  measures paginated user reads and concurrent node traffic writes, and truncates the DB afterwards.
- Local run (Node 20.15.1, PostgreSQL 16, in-process supertest): 100 reads, p50 131 ms / p95 170 ms;
  20 node traffic reports (10 entries each), p50 426 ms / p95 573 ms; 0 errors, all rows persisted.
  Numbers exclude network/Ingress/TLS overhead; a real-cluster rollout test is still required.
- `--runInBand`, `SCALE_*` env knobs and optional `SCALE_P95_LIMIT_MS` budget are documented in the runbook.
- Completed the deferred `@eslint/js` 10 upgrade: PR #26 failed because `@eslint/js` 10 has a
  `peerOptional eslint@^10` dependency, so `eslint` was bumped to `^10` too (10.15.0) in both
  `package.json` and the lockfile. `typescript-eslint` 8.73 already supports ESLint 10; flat config
  needed no changes. Local Node 20.15.1 only emits EBADENGINE warnings; CI's Node 20 resolves >=20.19.
- Full backend validation with the upgraded deps: typecheck, lint (0 errors, 84 pre-existing warnings),
  10 unit, build, 11 mock e2e, 12 PG e2e and the 5k/20 scale check — all pass.
- These changes were merged after the `v1.8.4` tag, which was published by the security fix; the next
  release should bump the version again.

## Done in v1.8.2

- Restored production fail-fast secret validation after the v1.6 port: `getJwtSecret()` and
  `getBootstrapAdminPassword()` replace `change-me` / `admin12345` defaults in production.
- `.env.example` now contains valid-length placeholder secrets; README RU/EN document the requirement.
- Versions bumped to 1.8.2 across packages, Swagger, k8s images, Helm values and the frontend constant.

## Done in v1.8.1

- Fixed issue #16: `backend/tsconfig.json` now sets `esModuleInterop: true`, so the compiled
  `dist/main.js` calls `cookie-parser`/`helmet` correctly instead of throwing
  `cookie_parser_1.default is not a function`. v1.8.0 images could not start; v1.8.1 can.
- Added `backend/test/compiled-main.e2e-spec.ts`: loads the built entrypoint with NestFactory,
  Swagger and AppModule mocked and asserts both global middleware registrations. It fails when
  the flag is removed. Supertest imports in e2e specs became default imports as required by
  `esModuleInterop`.
- Merged PR #13 (v1.5/v1.6 PostgreSQL e2e), #9 (Helm chart), #10 (CI/GHCR/dependabot),
  #14 (runbooks) and #15 (k8s monitoring validation). All tracked issues are closed.

## Done in v1.8.0

- Agent can collect per-user traffic from the Xray Stats API (`XRAY_STATS_ENABLED=true`) and POST
  deltas to `/api/nodes/:id/traffic`; the config generator adds a loopback API inbound.
- Delegated agent delivered: Helm chart with ServiceMonitor/PrometheusRule, CI infra checks and
  GHCR image builds, e2e tests for v1.5/v1.6, operational runbooks and live k8s monitoring validation.
- Versions bumped to 1.8.0 in packages, Swagger, k8s images, Helm values and the frontend constant.

## Done in v1.7.0

- Configurable backup schedule and retention from the Backups page: `BackupSettings` model,
  in-process scheduler with persisted `lastRunAt`/`nextRunAt`, `GET/PATCH /api/backups/settings`,
  automatic pruning beyond the configured retention.
- Organization and protocol reporting: `GET /reports/organizations`, `GET /reports/protocols`,
  CSV exports and a `/reports` admin page with date filters and a segmented switch.
- Versions bumped to 1.7.0 across packages, Swagger, k8s images and the frontend constant.

## Done in v1.6.0

- Ported the dark SaaS admin design onto the v1.5.0 codebase: design tokens in `globals.css`,
  reusable UI kit and icon set, sidebar/topbar shell, page search, modal forms, animations and
  full RU/EN dictionaries. `globals.css` is now imported in the root layout.
- Restyled every admin page including main-only plans and traffic pages (CSV export, chart),
  backups with restore, node health/logs and editable inbounds.
- Kept all v1.5.0 backend/infra features intact; bumped versions to 1.6.0 in packages,
  Swagger, k8s image tags and the frontend version constant.

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

1. Validate in a real cluster: pod rollout, in-cluster DNS `backend:3000`, `xss-backend-down`
   alert firing, Grafana ingress/TLS. Not possible in this sandbox (see constraints above).
2. Revisit the deferred major upgrades when capacity allows: NestJS 12 (`@nestjs/common` +
   `@nestjs/passport` and the rest of the platform), TypeScript 7 and
   `@tanstack/react-table` 9. Each needs a coordinated migration and green CI.
3. Load/soak test at the target scale (5k users / 20 nodes) before production rollout. The local
   scale harness above is a first baseline; run the soak knobs from `docs/runbooks/load-test.md`
   against a deployed instance before signing off.
4. After each change: keep `/work/XreyStudioServer` in sync with the git repo, commit, push,
   update README (ru/en), docs and this HANDOFF file. Tag a new release when the stage is complete.

## Event-level notification routing (v2.23.3, 2026-11-24)

- PR #165 (`feat: event-level notification routing for real alert producers`, v2.23.3) is merged
  into `main` as `59a8e5e`; PR #164 (`AdminLTE is the default UI`, v2.23.2) merged as `08072d6`.
- Release `v2.23.3` published: tag `v2.23.3` points at commit `389b207` (version bump to 2.23.3).
  CI, Images, Live API smoke and Release bundle jobs are green on both `main` and the tag.
- `NotificationsService.emit(event, options, organizationId?)` is now the single integration point
  for real alert producers: health-checks emit `NODE_ONLINE`/`NODE_OFFLINE` only on availability
  transitions, failed backups emit `BACKUP_FAILED`, applied config revisions emit
  `CONFIG_APPLIED`, successful payments emit `PAYMENT_RECEIVED`. Grafana webhook alerts are mapped
  from labels (`alertname`, `event`, `notificationEvent`) to `NotificationEvent` and routed through
  `emit()`. `broadcast()` is retained only for the manual `POST /notifications/test` endpoint.
- Only channels enabled for the event in `NotificationRoute` are used; routes with an
  `organizationId` apply only to notifications emitted for that same organization.
- Added `PAYMENT_RECEIVED` to `NotificationEvent` in `prisma/schema.prisma`, plus frontend
  labels (`eventPaymentReceived` in ru/en) and `/api/notifications/routes` documentation in
  `docs/api.md`.
- Tests: `alert-webhook.controller.spec.ts` (event mapping), updated payments unit spec
  (emit + tenant id), `backend/test/notification-routing.e2e-pg-spec.ts` (enabled/disabled
  channels, Grafana routing, webhook delivery via a local sink). E2E validated against PGlite on
  port 5432 with `DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e?pgbouncer=true`
  (`?pgbouncer=true` avoids PGlite's prepared-statement conflict).
- Local git in `/work/XreyStudioServer/.git` cannot write objects (proot fs error); use a clean
  clone under `/tmp/opencode` for commits and publish via `git push`/GitHub API.

## AdminLTE completeness audit (2026-11-24)

- PR #164 (`08072d6`) made AdminLTE the default UI. Audit: functional AdminLTE shell
  (`frontend/src/components/adminlte-shell.tsx`), grouped menu with all 21 admin pages present,
  shared Card/SectionTitle/Field/EmptyState components have AdminLTE branches, assets copied by
  `prebuild`, no TODO/FIXME/stubs in the frontend. Legacy Aurora UI intentionally kept behind
  `NEXT_PUBLIC_UI=aurora` / `localStorage=xss_ui`.
- Found and fixed unfinished edges in commit `f121bad`: READMEs still advertised v2.6.1 and the
  old dark SaaS UI (now v2.23.3 + AdminLTE section, EN/RU), and the UI-switch button labels were
  hardcoded English (`title="Switch UI"`, `label="Switch to AdminLTE UI"`); added `switchUi` /
  `switchToAdminLte` keys to both i18n dictionaries (346 keys parity) and used them in both shells.
- Verified locally: `npx tsc --noEmit`, `npx eslint` (0 errors), `npx next build --webpack` pass;
  CI/Images/Smoke green on main. Turbopack `npm run build` still fails locally on Node 20.15 only.

## Session context (final, 2026-11-24)

- Version bumped to `2.23.3` in `backend/src/version.ts`, `frontend/src/lib/version.ts`,
  both `package.json` and both `package-lock.json`; pushed as `389b207`.
- Local verification (clean clone `/tmp/opencode/xss-work-225`): backend `npm run typecheck`,
  `npm run lint` (warnings only), `npm test -- --runInBand` (31 passed), `npm run test:e2e`
  (11 passed), `npm run build` — all OK. Frontend `npx tsc --noEmit` OK.
- GitHub Release `v2.23.3` published (release id 457088550) with assets
  `xreystudio-v2.23.3.tar.gz` and `xreystudio-v2.23.3.zip`; CI, Images, Live API smoke and
  Release bundle are green on main and on the tag.
- Frontend build: added `@adminlte/react`'s optional peers as direct dependencies
  (`chart.js`, `flatpickr`, `jsvectormap`, `quill`, `sortablejs`, `tabulator-tables`,
  `tom-select`) in commit `7dac71b`; `npx next build --webpack`, `npm run lint`,
  `npx tsc --noEmit` all pass locally. Turbopack (`npm run build`) still fails locally on
  Node 20.15 because `magic-string@1.4.5` is ESM-only and CJS `require()` cannot load it;
  CI uses Node 20 latest (with require(esm)) and is green — no source change needed.
- PG e2e `test/v15.e2e-pg-spec.ts` skipped locally: local pg_dump 16 cannot dump PGlite 19
  (Alpine has pg_dump <=16; CI uses PostgreSQL 16 and passes). Other PG suites: 15 suites /
  69 tests passed with `DATABASE_URL=...?pgbouncer=true`.
- `/work/XreyStudioServer` recloned from GitHub main, synced to `a5438b1` by copying loose
  git objects from `/tmp/opencode/xss-work-225` (proot blocks git object writes directly);
  working tree clean. `core.filemode=false` set locally; `graft/` preserved;
  `temp_git/` is local scratch now ignored via `.gitignore`; old checkout in
  `/work/.trash/2026-11-24-XreyStudioServer.old/`.
- npm ci in `/work` fails with EACCES on symlinks (proot); use `/tmp/opencode` clone for
  installing dependencies and running tests.

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
