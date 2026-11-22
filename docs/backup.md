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

Off-site copy example (add to the same crontab line after `backup.sh`):

```cron
15 3 * * * cd /opt/XreyStudioServer && ./scripts/backup.sh && rclone copy backups remote:xss-backups >> /var/log/xss-backup.log 2>&1
```
