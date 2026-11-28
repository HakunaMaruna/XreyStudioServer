# Plugin system

See `ADR.md` for decisions and `PLUGIN_SPEC.md` for the package format.

## Run App Store

`docker-compose.control.yml` includes:

- `store-db` — separate PostgreSQL database;
- `store` — catalog API and simple web catalog on port 3012;
- `backend` — master panel, configured with `STORE_API_URL` and `STORE_API_TOKEN`.

```bash
docker compose -f docker-compose.control.yml up -d --build store backend
```

Store endpoints:

- `GET /` — catalog web page;
- `GET /moderation` — moderation page (enter `STORE_ADMIN_TOKEN`);
- `GET /api/store/plugins?search=&category=`;
- `GET /api/store/plugins/:slug`;
- `POST /api/store/check-updates { versions }`;
- `POST /api/store/publish` — requires `X-Store-Token`;
- `POST /api/store/status/:slug { status }` — requires `X-Store-Token`;
- `POST /api/store/revoke/:slug { version, reason }`;
- `GET /api/store/revocations`.

## CLI

```bash
node scripts/plugin-cli.mjs keygen plugin-private.pem plugin-public.pem
node scripts/plugin-cli.mjs create examples/plugins/com.example.demo com.example.demo "Demo"
node scripts/plugin-cli.mjs pack examples/plugins/com.example.demo demo.plugin.json plugin-private.pem
```

Add `plugin-public.pem` content to `PLUGIN_STORE_PUBLIC_KEY` in master `.env`.

## Panel UI

`/plugins` has tabs Installed, Catalog and Policy. Master controls the policy; tenants see
the catalog filtered by master and install signed packages. On install/enable/update/uninstall
a system snapshot is created before the change by default (`PLUGIN_AUTO_SNAPSHOT=false` disables).

## Environment

```text
STORE_DB=xss_store
STORE_ADMIN_TOKEN=<random>
STORE_API_URL=http://store:3012
PLUGIN_STORE_PUBLIC_KEY=<PEM>
PLUGIN_ALLOW_UNSIGNED=false
PLUGIN_AUTO_SNAPSHOT=true
PLUGINS_DISABLED=false
PLUGIN_SAFE_MODE=false
```


## Upload and moderation (master panel)

The master panel has two extra tabs under **Plugins**:

- **Upload** — select a `.plugin.json` package. The panel validates the manifest,
  runs static checks (no direct DB/env/fs/network APIs), signs the package with
  `PLUGIN_STORE_PRIVATE_KEY` and publishes it to the store with status `REVIEW`.
- **Review** — list of pending submissions with approve/reject buttons. Approving
  sets the store plugin status to `PUBLISHED`.

Only ADMIN can upload or review. Plugins are currently free and authored by us.

### Key rotation

`PLUGIN_STORE_PUBLIC_KEY` is the current verification key, `PLUGIN_STORE_PUBLIC_KEY_OLD`
is still accepted so previously published plugins keep working. When rotating,
generate a new Ed25519 pair with `node scripts/plugin-cli.mjs keygen`, keep the
private key in a secret store, publish the public key to all panels and keep the
old public key until every installed plugin has been re-signed.
