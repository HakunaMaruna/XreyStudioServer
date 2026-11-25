# Installation Guide

## Requirements
- Ubuntu/Debian
- Docker + Docker Compose

## Modes
- panel: panel only
- node: agent + Xray
- subscription: subscription page only
- all-in-one: everything

## Steps

The recommended path is the one-command installer:

```bash
curl -fsSL https://raw.githubusercontent.com/HakunaMaruna/XreyStudioServer/main/install.sh | bash
```

It shows a colored menu, asks for the language (`en`/`ru`) and installation mode, generates all
secrets, checks DNS for the domain and starts the selected services. Non-interactive usage:

```bash
./install.sh --mode all-in-one --domain example.com --lang en --yes --dry-run
```

Options: `--mode`, `--domain`, `--lang en|ru`, `--yes`, `--dry-run`, `--help`.
Then open `https://<domain>/login`. Keep the printed admin credentials in a safe place.

## Upgrades
Pull the new version, rebuild and restart with `make update` (or `docker compose up -d --build`).
The database schema is applied automatically: the Kubernetes init container runs
`npx prisma db push --skip-generate`; for a manual deployment run
`cd backend && npx prisma db push` once before starting the new API. This creates the
`AlertHistory`, `UserTraffic` tables and the `Payment.planId` column without deleting data.
Take a backup first (`make backup`).

## Backups page
The Admin-only **Backups** page (`/backups`) can create, list, download and delete PostgreSQL
snapshots and restore one with explicit confirmation. The backend image installs
`postgresql-client`; Docker Compose mounts `./backups` to `/app/backups` in the backend so the UI
and the CLI share the same snapshots. The CLI still works: `make backup` and
`make restore FILE=...`.

## Reporting and CSV export
The **Traffic** page (`/traffic`) shows a daily chart for the last 1-90 days with an optional user
filter and CSV export. The **Audit** and **Payments** pages also have an **Export CSV** button.
Exports use `GET /api/traffic/export.csv`, `GET /api/audit/export.csv` and
`GET /api/payments/export.csv`, with a limit of 10 000 rows per export.

## API rate limiting
When `REDIS_URL` is set, rate limiting counters are stored in Redis and shared across replicas.
If Redis is absent or down, the API falls back automatically to in-memory limiting. `THROTTLE_TTL`
and `THROTTLE_LIMIT` still apply in both modes. `REDIS_URL` has been added to `.env.example`.

## Kubernetes monitoring
Prometheus and Grafana ship in `k8s/monitoring.yaml`; their ConfigMaps are generated from
`monitoring/` with `node k8s/generate-monitoring.mjs` (or `make k8s-monitoring`) and included in
`kustomization.yaml`. The Grafana password and alert webhook token come from `xss-secrets`.
Prometheus scrapes `backend:3000/api/metrics`; if `METRICS_TOKEN` is set, either leave it empty for
the bundled Prometheus or patch the scrape config and regenerate. Access the UIs with:

```bash
kubectl -n xss port-forward svc/grafana 3002:3000
kubectl -n xss port-forward svc/prometheus 9091:9090
```

Regenerate the ConfigMaps after changing dashboards or alerts.

## Makefile
- `make install`, `make up`, `make down`, `make logs`, `make update`
- `make backup` — gzip PostgreSQL dump into `BACKUP_DIR` (default `backups/`), retention `BACKUP_KEEP` (default 7); cron example in `docs/backup.md`
- `make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz`
- `make monitoring` — Prometheus (`:9091`) + Grafana (`:3002`, password `GRAFANA_PASSWORD`)
- `make k8s-monitoring` — generate the Kubernetes monitoring ConfigMaps from `monitoring/` (same
  as `node k8s/generate-monitoring.mjs`)

## Monitoring
The monitoring services are behind the `monitoring` Compose profile and are not started by
`docker compose up` unless the profile is enabled. Grafana comes with the Prometheus datasource
and the `XreyStudioServer — Overview` dashboard pre-provisioned from `monitoring/`.
Provisioned Grafana alert rules and webhook delivery are described in `docs/monitoring.md`.
If you set `METRICS_TOKEN`, pass the same value as `X-Metrics-Token` in the Prometheus scrape
configuration (or leave it unset and keep `backend:3000` reachable only inside the Compose network).

## Password hashing

New passwords are hashed with Argon2id by default. Set `PASSWORD_HASHER=bcrypt` to keep using
bcrypt for new hashes. Existing hashes in both formats are verified automatically, so upgrades do
not require a password reset.

## Stripe webhooks
Set both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The webhook endpoint verifies the
`Stripe-Signature` header against the raw request body (HMAC-SHA256, 5-minute tolerance) and
ignores duplicate `checkout.session.completed` events for already paid invoices.

## Agent mTLS
For HTTPS agent URLs, set `AGENT_CA`, `AGENT_CERT` and `AGENT_KEY` to PEM file paths readable by
the backend container. Without these, signed `AGENT_TOKEN`/`AGENT_SECRET` headers are used.

## Node TLS certificates (Let's Encrypt)

Set `NODE_DOMAIN_SUFFIX` (for example `nodes.example.com`) and point a DNS record
`*.nodes.example.com` at the panel's public IP. The panel solves ACME HTTP-01 challenges through
the shared Caddy webroot (`/.well-known/acme-challenge/`), so each node hostname only needs to
resolve to the panel — the node itself does not have to be publicly reachable.

```bash
# issue and install a certificate for one node
POST /api/certificates/<node_id>/issue
# inspect status
GET  /api/certificates/<node_id>
# renew all issued certificates
POST /api/certificates/renew-all
```

The certificate and key are stored in `CERTS_DIR` (`/app/certs`) and pushed to the agent, which
writes them to `AGENT_TLS_DIR` (`/etc/xss-agent/tls`) and restarts its HTTPS listener. The node's
`agentUrl` is then updated to `https://node-<id>.<suffix>:9090`. Requires `LE_EMAIL` for ACME
registration.

## Traffic accounting and quotas
The panel does not read Xray statistics by itself — a collector on each node reports per-user
usage. Issues a node bearer token with `POST /api/nodes/:id/rotate-token` (admin), then POST:

```bash
curl -X POST http://<panel>/api/nodes/<node_id>/traffic \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{"entries":[{"subscriptionToken":"<token>","up":1024,"down":2048}]}'
```

`up`/`down` are byte deltas for the period; an entry may also identify a user by `userId` or
`email`. Each report creates a `UserTraffic` row, increments `User.trafficUsed` and sets status
`EXPIRED` when `trafficLimit` (bytes, 0 = unlimited) is reached. Subscriptions then report
`exceeded` and config exports return `403`; reset with `POST /api/users/bulk` (`resetTraffic`).
History and totals are available at `GET /api/traffic` (admin/operator).

The bundled agent can act as this collector: set `XRAY_STATS_ENABLED=true` (and optionally
`XRAY_API_HOST`, `XRAY_API_PORT`, `TRAFFIC_REPORT_INTERVAL`). The panel then adds a loopback Xray
API inbound (`dokodemo-door` on `127.0.0.1:8080` by default) to every generated config. The agent
reads cumulative `user>>>email>>>traffic>>>uplink/downlink` counters with `xray api statsq`,
converts them to deltas and POSTs them to `/api/nodes/:id/traffic` every interval (60 s default).
No external collector is needed when this is enabled.

## Plans and payments
Create plans on the **Plans** page (or `POST /api/payments/plans`) with traffic in GB and duration
in days. When creating a manual payment (`POST /api/payments`), choose a plan; marking it paid
(`POST /api/payments/:id/paid`) activates the user, resets traffic and sets `expiresAt`. Stripe
Checkout events go through the same provisioning path when `client_reference_id` is the payment id.

## Node logs
The **Logs** button on the Nodes page calls `GET /api/nodes/:id/logs?service=xray|singbox&lines=200`.
The agent reads `journalctl -u <service>`; the backend container needs network access to the agent
and the same `AGENT_SECRET`. If `journalctl` is unavailable in a container, set
`XRAY_LOG_PATH` / `SINGBOX_LOG_PATH` to readable log files on the node as a fallback.

### Скрытый вход (decoy mode)

Необязательно: `PANEL_DECOY=true` и `PANEL_ENTRY_PATH=<secret>` (6–64 символа: буквы, цифры, `-`, `_`).
В этом режиме публичный адрес открывает страницу-заглушку, а панель доступна по `/<secret>/login`.
Успешный логин выставляет httpOnly-cookie `xss_ui_access` — она используется middleware только
для выбора маршрута и **не заменяет JWT**; все `/api`-запросы остаются под JWT-защитой.
После выхода cookie удаляется. subscription-ссылки `/sub/*` и API продолжают работать без изменений.
Неверно заданный `PANEL_ENTRY_PATH` не создаёт вход (fail closed). Переменные пробрасываются
в frontend через `docker-compose.yml`; backend читает `PANEL_DECOY` из env_file `.env`.

## Signed updates (Ed25519)

Release archives can be signed in CI so nodes can verify them before applying. Generate
a dedicated keypair once (never commit the private key):

```sh
openssl genpkey -algorithm ed25519 -out update_private.pem
openssl pkey -in update_private.pem -pubout -out update_public.pem
chmod 600 update_private.pem
```

Store `update_private.pem` contents in the GitHub repository secret `UPDATE_PRIVATE_KEY`.
The release workflow signs each `tar.gz` with `openssl pkeyutl -sign -rawin` and attaches
`<asset>.sig` plus `update_public.pem` to the release. Set `UPDATE_PUBLIC_KEY` in the panel
environment to the PEM public key (or its base64 encoding) to enable
`POST /api/updates/verify`. Verification fails closed when no key is configured.

Verify an asset manually:

```sh
node scripts/verify-update.mjs release.tar.gz release.tar.gz.sig update_public.pem
```

## Verification checklist

After the stack is up, work through this list before inviting users:

1. `curl -fsS https://<domain>/api/health` returns `ok` with a database check.
2. `https://<domain>/docs` renders the public documentation; `https://<domain>/robots.txt`
   and `/sitemap.xml` are reachable. Set `NEXT_PUBLIC_SITE_URL` to the external origin so the
   generated canonical links are correct.
3. Sign in at `/login`. If you enabled decoy mode, use `/<PANEL_ENTRY_PATH>/login` instead.
4. Create one inbound and one node. The node reports `ONLINE` and a non-empty revision.
5. Create a test user with `deviceLimit=1`, open the subscription link, and confirm the second
   device receives a clear 403 message.
6. Create a backup and confirm the file name ends in `.sql.gz.enc` when
   `BACKUP_ENCRYPTION_KEY` is set. If S3 is configured, confirm the encrypted object exists.
7. Run `/doctor` and resolve every warning before going live.

For the exact click-by-click UI workflow, see [user-guide.md](user-guide.md); for diagrams of the
same processes, see [processes.md](processes.md).

## Rollback

Keep the previous image tag in `docker-compose.yml`. To roll back:

1. Stop writes: put the panel into maintenance mode or block the frontend at the reverse proxy.
2. Take a fresh snapshot with `make backup` — even if the new version is broken, it captures the
   current database state.
3. Restore the last known-good database backup *before* starting the older backend when schemas
   differ; see [backup.md](backup.md) and the restore drill runbook.
4. Change image tags to the previous version, run `docker compose up -d`, and repeat the
   verification checklist above.

Never remove the database volume to "fix" a failed migration: that destroys user data.
