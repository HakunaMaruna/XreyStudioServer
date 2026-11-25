# Terminal CLI (`xss`)

`install.sh` installs a symlink `/usr/local/bin/xss` on panel hosts
(`panel`, `all-in-one` and `control` modes). It points at `scripts/xss` in the
installation directory, so a `git pull` updates the command without reinstalling it.

The same guide is rendered in the panel under **Help → Documentation → Терминальное
меню xss** and on the public `/docs#cli` page.

```bash
xss start
```

`xss start` opens an interactive terminal menu over SSH or a local console:

```
XSS Panel 2.32.0
/opt/XreyStudioServer

Последние снимки:
#   Дата/время (UTC)  Событие  Размер  Файл
1   2026-11-25 20:10:00  перед обновлением  12MiB  db-20261125-201000.sql.gz

  1) Снимки и восстановление
  2) Создать снимок
  3) Обновить панель
  4) Пересобрать / переустановить
  5) Состояние сервисов
  6) Перезапустить сервисы
  7) Логи
  8) Остановить / запустить
  9) Справка
  0) Выход
```

The menu uses plain ANSI colours and `read`; it does not need `whiptail`, `dialog`
or `gum`. If the panel was installed before this command existed, create the link
manually:

```bash
sudo ln -sfn /opt/XreyStudioServer/scripts/xss /usr/local/bin/xss
```

## Commands

| Command | Action |
| --- | --- |
| `xss start` / `xss menu` | interactive menu |
| `xss status` | version, backup count and `docker compose ps` |
| `xss snapshots` / `xss list` | snapshots with date, time (UTC), event, size and file name |
| `xss backup` | create a snapshot now; encrypted when `BACKUP_ENCRYPTION_KEY` is set (`--event NAME`, `--note TEXT`) |
| `xss restore [NAME]` | restore a snapshot (interactive choice without `NAME`) |
| `xss update` | check the git tree, take a `pre-update` snapshot, pull and rebuild |
| `xss reinstall` | rebuild images and recreate containers, keeping volumes and `.env` |
| `xss restart` | restart the Compose services |
| `xss up` / `xss stop` | start / stop the Compose services |
| `xss logs [SERVICE]` | follow the last 200 log lines |
| `xss version` / `xss help` | version / usage |

## Snapshot events

The backend and CLI write a sidecar file next to each snapshot (`<snapshot>.meta`,
for example `<name>.sql.gz.meta` or `<name>.sql.gz.enc.meta`):

```text
event=manual
created_at=2026-11-25T20:10:00Z
version=2.32.0
note=optional
```

Known events:

- `manual` — created from the Backups page, `make backup`, `xss backup` or the menu;
- `scheduled` — created by the in-app backup schedule;
- `pre-update` — automatic safety snapshot before `xss update`;
- `pre-restore` — automatic safety snapshot before `xss restore`;
- `pre-reinstall` — automatic safety snapshot before `xss reinstall`.

Older snapshots without a sidecar are shown as `unknown`. The sidecar is metadata
read by the backend and the terminal menu; retention removes it together with the
snapshot.

## Restore safety

`xss restore` uses a database swap instead of importing into the live database:

1. Asks for explicit confirmation (`yes`), then decrypts and validates the selected
   snapshot. The live database is untouched if this fails.
2. Creates a `pre-restore` snapshot of the current database.
3. Creates a temporary database (`xss_restore_*`) and imports the dump into it.
   The live database is untouched if the import fails.
4. Stops the panel services for the short swap.
5. Renames the live database to `xss_prev_*`, renames the imported database to the
   live name and starts the panel again.
6. Drops `xss_prev_*` after the panel starts. If the start fails, the old database
   is kept and its name is printed.

The pre-restore snapshot is exempt from retention, so restoring an old snapshot
does not delete the file being restored. Docker volumes are not touched.

Plain `.sql.gz` snapshots are imported directly. Encrypted `.sql.gz.enc` snapshots
are decrypted inside the `backend` container with `BACKUP_ENCRYPTION_KEY`; this
requires the default `./backups` directory because that is what Compose mounts at
`/app/backups`.

When `BACKUP_ENCRYPTION_KEY` is set, `xss backup` and the automatic safety
snapshots encrypt the dump through the `backend` container and store only
`.sql.gz.enc`. If encryption cannot run (no backend service, custom `BACKUP_DIR`,
bad key), the command fails and removes the temporary plaintext dump: it never
silently leaves an unencrypted snapshot. Without the key, `xss backup` creates a
plain `.sql.gz` snapshot. `make backup` and `scripts/backup.sh` still create
plaintext snapshots; use the Backups page for S3-off-site backups.

## Update and reinstall

`xss update` refuses to run with uncommitted changes, checks out the current branch
(or the first local branch on a detached HEAD), runs `git pull --ff-only`, then
rebuilds and restarts the Compose services. It creates a `pre-update` snapshot first.

`xss reinstall` runs `docker compose build` and `docker compose up -d --force-recreate`.
It does not remove volumes, `.env` or `backups/`, so the database is preserved. Use
`xss update` when the goal is to fetch a new release from git.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `xss: command not found` | Re-run `install.sh`, or create the symlink shown above. |
| The menu does not open | Run it in a TTY; check `docker compose version`. |
| Snapshot creation fails | Check that the `postgres` container is running (`xss status`). |
| Encrypted snapshot fails | Check `BACKUP_ENCRYPTION_KEY`, `BACKUP_DIR=backups` and the `backend` service. No plaintext snapshot is kept. |
| Encrypted restore fails | The key must be the same one used to create the `.sql.gz.enc` file. The live database is not changed. |
| Panel does not start after restore | The previous database is kept as `xss_prev_*`; inspect `xss logs backend` and the database names. |
| `xss update` refuses to run | Commit or stash local changes first. |

## Related documentation

- [Backup and restore](backup.md) — UI/API backups, encryption and S3/R2.
- [Installation](install.md) — installation modes and the CLI symlink.
- [Processes](processes.md) — backup and restore flows.
