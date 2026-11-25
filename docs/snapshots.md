# System snapshots

State snapshots are ADMIN-only, point-in-time captures of the installation state. They are
distinct from the nightly `db-*.sql.gz` backups in `scripts/backup.sh`: a snapshot records both
the database and settings, carries metadata (who/why/when, version, checksum) and can be
restored through the UI or from a terminal.

## Architecture and contents

A snapshot is stored under `<BACKUP_DIR>/snapshots/<id>/`:

```
<BACKUP_DIR>/snapshots/<uuid>/
├── manifest.json              # metadata, component paths and checksum
├── db.sql.gz                  # database dump (SQL or gzip)
├── settings.json              # settings export
└── pre-restore-settings.json  # written by offline restore before settings are replaced
```

`manifest.json` contains the snapshot fields returned by the API: `id`, `label`, `kind`, `scope`,
`status`, `reason`, `appVersion`, `sizeBytes`, `checksum`, `createdAt`, `restoredAt`, plus the
relative component paths (`dbFile`, `settingsFile`). The checksum is a `sha256` hex digest of
`db.sql.gz` and is verified before any offline restore. Paths in the manifest must be plain
file names inside the snapshot directory; a path escaping that directory is rejected.

`kind` separates manual, automatic and pre-restore snapshots. `status` tracks lifecycle
(e.g. creating, ready, restoring, restored, failed). Snapshot ids are UUIDs.

## UI vs terminal

- UI: **Settings → State snapshots** — create, list, inspect, restore and delete with the ADMIN
  panel. Restore always shows a confirmation step and an optional dry run.
- Terminal: `sh scripts/snapshot.sh ...` or the `make snapshot-*` targets below. The CLI uses
  `/api/snapshots` with an ADMIN JWT. No browser and no panel session are required.
- Offline: with `OFFLINE=1`, restore reads the manifest from disk and applies it with `psql`
  and `cp` directly. This is the fallback when the API is unreachable; it still requires
  `CONFIRM=1`.

## Automatic triggers

The policy has four fields:

| Field | Meaning |
| --- | --- |
| `autoBeforeUpdates` | capture a snapshot before an update is applied |
| `autoBeforeSettings` | capture a snapshot before settings changes are committed |
| `retention` | maximum number of snapshots to keep |
| `cooldownMinutes` | minimum interval between automatic snapshots |

`autoBeforeUpdates` is wired to real update paths: `POST /api/updates/apply` (panel update),
`POST /api/nodes/:id/apply` and `POST /api/nodes/:id/rollback/:revisionId` (node configuration)
are marked with `@SnapshotBefore('update', ...)`, so an update-type snapshot is taken first
(subject to policy and cooldown). This also covers `scripts/rollout.sh`, which calls the same
node apply endpoint.

Automatic snapshots are created by the backend; the CLI only reads and updates the policy via
`GET/PATCH /api/snapshots/policy`. Retention and cooldown apply to automatic captures — manual
snapshots are not silently dropped by the CLI: `snapshot.sh prune [keep]` explicitly deletes the
oldest snapshots beyond `keep` and requires `CONFIRM=1`.

## Restore semantics

- `POST /api/snapshots/:id/restore` accepts `{ "confirm": true }`, optional `dryRun: true` and
  optional `components: ["db", "settings"]`. Without `confirm: true` nothing is applied.
- A restore first creates a **pre-restore snapshot** of the current state, so the operation can
  be rolled back. The offline CLI writes the current settings file to
  `<snapshot dir>/pre-restore-settings.json` before replacing it.
- `dryRun: true` (CLI: `DRY_RUN=1`) validates the snapshot and reports the planned actions
  without touching the database or settings.
- `components` limits what is restored: `db`, `settings`, or both. The offline CLI accepts a
  comma-separated `COMPONENTS=db,settings` value for the same purpose.
- Offline restore verifies `sha256` of `db.sql.gz` from the manifest, then applies it with
  `psql "$DATABASE_URL"` (`gzip -dc` when the file is gzip). Settings are copied back to
  `SETTINGS_FILE` only when the settings component is selected.
- Restoring is destructive for current state. Use `DRY_RUN=1` first and keep the pre-restore
  snapshot until the installation is verified.

## Security and secrets

- Every online endpoint requires an ADMIN JWT. The CLI reads it from `XSS_ADMIN_TOKEN`
  The token is sent in the `Authorization` header only.
- Never put a JWT in `LABEL`, `REASON`, a filename, or a command shown in logs. The CLI does not
  print the token, `DATABASE_URL` or response headers.
- JSON bodies are built with `python3` `json.dumps`; user-provided labels, reasons and scopes
  are never interpolated into shell commands or raw JSON strings. Ids are validated as UUIDs
  and manifest paths are checked to stay inside the snapshot root.
- Snapshot archives contain settings and database data. Restrict filesystem permissions on
  `<BACKUP_DIR>` and avoid committing snapshots to git.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:3000` | backend base URL for online commands |
| `XSS_ADMIN_TOKEN` | — | ADMIN JWT; required for online commands |
| `BACKUP_DIR` | `backups` | root containing `snapshots/<uuid>/` |
| `DATABASE_URL` | — | connection string for offline database restore |
| `SETTINGS_FILE` | `$BACKUP_DIR/panel-settings.json` | settings file backed up and restored |

## CLI examples

```sh
# Create a manual snapshot
LABEL='before-upgrade' REASON='planned maintenance' sh scripts/snapshot.sh create

# Inspect state and policy
sh scripts/snapshot.sh list
sh scripts/snapshot.sh policy

# Update policy
sh scripts/snapshot.sh set-policy retention=10 cooldownMinutes=30 autoBeforeUpdates=true

# Preview and then perform a restore
DRY_RUN=1 CONFIRM=1 sh scripts/snapshot.sh restore <uuid>
CONFIRM=1 sh scripts/snapshot.sh restore <uuid>

# Only restore settings, offline
OFFLINE=1 CONFIRM=1 COMPONENTS=settings sh scripts/snapshot.sh restore <uuid>
```

Offline restore always verifies the manifest checksum; with `COMPONENTS=settings` the database
dump itself is not applied.

## Make examples

```sh
make snapshot-create LABEL='before-upgrade' REASON='planned maintenance'
make snapshot-list
make snapshot-policy
make snapshot-restore ID=<uuid> DRY_RUN=1 CONFIRM=1
make snapshot-restore ID=<uuid> CONFIRM=1 OFFLINE=1
make snapshot-delete ID=<uuid> CONFIRM=1
```

Targets proxy to `scripts/snapshot.sh` and forward `LABEL`, `REASON`, `SCOPE`, `ID`, `CONFIRM`,
`DRY_RUN`, `OFFLINE` and `COMPONENTS` from the environment/make variables. Export
`XSS_ADMIN_TOKEN` in the shell environment before invoking `make`; do not pass a JWT as an
argv item.

## API examples

See [api.md](api.md#snapshots-api) for the full endpoint reference. A minimal online flow:

```sh
curl -fsS -H "Authorization: Bearer $XSS_ADMIN_TOKEN" \
  "$API_BASE_URL/api/snapshots"
curl -fsS -X POST -H "Authorization: Bearer $XSS_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"label":"before-upgrade","reason":"planned maintenance"}' \
  "$API_BASE_URL/api/snapshots"
```
