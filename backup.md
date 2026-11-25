# Scheduled backups

`scripts/backup.sh` dumps the PostgreSQL database, gzip-compresses it and keeps the last
`BACKUP_KEEP` files (7 by default). It is safe to run it from cron.

Example crontab (daily at 03:15, install with `crontab -e`):

```cron
15 3 * * * cd /opt/XreyStudioServer && /usr/bin/flock -n /tmp/xss-backup.lock ./scripts/backup.sh >> /var/log/xss-backup.log 2>&1
```

`flock` prevents overlapping runs if a backup takes longer than a day. Adjust the path to your
installation directory. For Docker Compose installations without a system cron, the host must run
the command (the script itself calls `docker compose exec postgres pg_dump`).

Environment variables in `.env`:

- `BACKUP_DIR` — output directory (default `backups/` inside the project).
- `BACKUP_KEEP` — number of recent archives to keep (default `7`).

With Docker Compose, the equivalent Makefile target is `make backup`.

Restore:

```bash
make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz
# or
./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.sql.gz
```

The restore overwrites the current database; take a fresh backup first.

## Web UI / API

The Backups page (`/backups`) is available to admins and uses the same backup directory as the
CLI. From the page you can:

- create a snapshot (`POST /api/backups`) — a gzip `pg_dump` named `db-YYYYMMDD-HHMMSS.sql.gz` in
  `BACKUP_DIR`, pruned to the last `BACKUP_KEEP` archives;
- download the `.sql.gz` file (`GET /api/backups/:name/download`);
- delete a backup (`DELETE /api/backups/:name`);
- restore a backup (`POST /api/backups/:name/restore`) — the request body must contain
  `{ "confirm": true }`, so a restore cannot be triggered accidentally;
- configure an in-app schedule and retention (`GET`/`PATCH /api/backups/settings`) from the
  **Schedule** card on the Backups page. Settings live in the `BackupSettings` table:
  `enabled`, `intervalHours` (1–720) and `retention` (1–100). The backend runs a lightweight
  in-process timer and persists `lastRunAt` / `nextRunAt`. Each scheduled run prunes archives
  beyond `retention`.

All endpoints require an admin JWT; see `docs/api.md` for response shapes. Restore runs `psql`
against `DATABASE_URL` and overwrites the current database — take a fresh backup first and perform
restores during a maintenance window. The backend image ships `postgresql-client`, and Docker
Compose mounts `./backups` at `/app/backups`, so files created in the UI are visible to
`scripts/backup.sh` and vice versa.

The CLI workflow above (`make backup`, `make restore`, cron) keeps working as before.

Off-site copy example (add to the same crontab line after `backup.sh`):

```cron
15 3 * * * cd /opt/XreyStudioServer && ./scripts/backup.sh && rclone copy backups remote:xss-backups >> /var/log/xss-backup.log 2>&1
```

## Encrypted backups and S3/R2

New backups created by `POST /api/backups` are encrypted client-side with AES-256-GCM when
`BACKUP_ENCRYPTION_KEY` (base64, 32 bytes) is set. Generate it with
`openssl rand -base64 32` and store it outside the repository. Encrypted files use the
suffix `.sql.gz.enc` with the layout `XSS1 | version(1) | IV(12) | ciphertext | tag(16)`.
Reads and restores decrypt transparently and verify the GCM tag; legacy `.sql.gz` files
remain readable. Tampered or truncated files are rejected.

To upload each new backup to S3 or Cloudflare R2, set `BACKUP_S3_BUCKET`,
`BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, optionally `BACKUP_S3_ENDPOINT`
(https only, for R2), `BACKUP_S3_REGION` (default `auto`), `BACKUP_S3_PREFIX` (default
`backups/`) and `BACKUP_S3_SSE` (only if the provider supports the AES256 header). When a
bucket is configured, encryption is mandatory: an unset `BACKUP_ENCRYPTION_KEY` fails the
request instead of uploading plaintext. Credentials are never stored in the database or
logged. If the upload fails, the encrypted local backup is retained and the error is
returned to the caller.

## Encrypted backups and S3/R2 (v2.23.4+)

Backups can be encrypted at rest with AES-256-GCM before they leave the host. Generate the key
once and store it in a password manager:

```sh
openssl rand -base64 32
```

Set the result as `BACKUP_ENCRYPTION_KEY` in `.env`. The encrypted format is
`XSS1 | version(1) | IV(12) | ciphertext | tag(16)`; the header and tag are authenticated, so a
modified or truncated file is rejected before any SQL is executed.

### Step-by-step

1. Set `BACKUP_ENCRYPTION_KEY` (and optionally `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`). Never commit these values.
2. Restart the backend so it picks up the new environment, then create a snapshot from the
   **Backups** screen or with `make backup`.
3. Confirm the file name ends in `.sql.gz.enc`. If a bucket is configured, confirm the object is
   present there and that no plaintext `.sql.gz` was uploaded — the backend refuses an
   unencrypted backup while S3 is enabled.
4. To restore, use `POST /api/backups/:name/restore` with `{ "confirm": true }` or `scripts/restore.sh`.
   Legacy plaintext `.sql.gz` backups remain readable for migration, but new plaintext backups are
   only allowed when no bucket is configured.
5. Verify the restore on a staging host with [runbooks/backup-restore-drill.md](runbooks/backup-restore-drill.md).
   Practise a key-rotation drill too: decrypt with the old key, re-encrypt with the new one, and
   confirm the GCM tag validates.

### Failure modes

- **Missing or wrong key** → restore fails with a clear decryption error; the database is untouched.
- **Tampered ciphertext or truncated tag** → authentication fails; the backup is not applied.
- **S3 configured without an encryption key** → backup creation fails closed instead of uploading
  plaintext.

For the full orchestration flow, see [processes.md](processes.md#5-backup-and-restore).
