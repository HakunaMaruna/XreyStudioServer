# Проверка бэкапа и восстановление во временную БД

## Симптомы

- Запланированная проверка бэкапа (дриль) или подготовка к восстановлению после инцидента.
- В UI `/backups` есть файл `db-YYYYMMDD-HHMMSS.sql.gz`, но неизвестно, можно ли им восстановиться.
- При восстановлении появляются ошибки `relation already exists`, `role ... does not exist` или `gzip: invalid compressed data`.

## Проверки

```bash
cd /opt/XreyStudioServer
set -a; . ./.env; set +a
export BACKUP_DIR=${BACKUP_DIR:-backups}
export BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/db-*.sql.gz | head -1)

ls -lh "$BACKUP_DIR"/db-*.sql.gz
gzip -t "$BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | head -5
```

Ожидается: `gzip -t` молча завершается с кодом 0, в начале файла — комментарии `pg_dump` и `CREATE TABLE`.

Проверка расписания и списка бэкапов (v1.7.0+) через API:

```bash
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD='strong-admin-password'
export ADMIN_TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3000/api/backups/settings
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3000/api/backups
```

## Команды: восстановление во временную БД

```bash
cd /opt/XreyStudioServer
set -a; . ./.env; set +a
export BACKUP_FILE=$(ls -1t "${BACKUP_DIR:-backups}"/db-*.sql.gz | head -1)
export DRILL_DB=xss_restore_drill_$(date +%Y%m%d%H%M%S)
export PGUSER=${POSTGRES_USER:-xss}
export PGDATABASE=${POSTGRES_DB:-xss}

docker compose exec -T postgres psql -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$DRILL_DB\";"

gunzip -c "$BACKUP_FILE" \
  | docker compose exec -T postgres psql -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1

docker compose exec -T postgres psql -U "$PGUSER" -d "$DRILL_DB" \
  -c 'select count(*) as users from "User";' \
  -c 'select count(*) as payments from "Payment";' \
  -c 'select count(*) as traffic_rows from "UserTraffic";'

docker compose exec -T postgres psql -U "$PGUSER" -d postgres -c "DROP DATABASE \"$DRILL_DB\";"
```

Для Kubernetes (бэкап, созданный UI, лежит в `BACKUP_DIR` пода backend):

```bash
export NAMESPACE=xss
export BACKUP_FILE=$(kubectl -n "$NAMESPACE" exec deploy/backend -- sh -c 'ls -1t ${BACKUP_DIR:-/app/backups}/db-*.sql.gz | head -1')
kubectl -n "$NAMESPACE" exec deploy/backend -- pg_dump "$DATABASE_URL" --no-owner --no-privileges > /tmp/xss-drill.sql
```

> В Kubernetes нет `docker compose exec postgres`: восстановление во временную БД выполняйте из пода
> backend с `psql "$DATABASE_URL_ДЛЯ_DRILL"` или через отдельный под/сервис PostgreSQL.

## Ожидаемый результат

- `gzip -t` проходит, дамп содержит схему и данные.
- `psql ... -v ON_ERROR_STOP=1` завершается без ошибок (код 0).
- Числа в `$DRILL_DB` совпадают с ожидаемыми (сравните с боевой БД: `docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDATABASE" -c 'select count(*) from "User";'`).
- Временная БД удалена в конце проверки; боевая БД не изменена.

## Типичные ошибки

| Ошибка | Причина | Действие |
|---|---|---|
| `relation "User" already exists` | Восстановление в непустую БД | Создать новую `$DRILL_DB`, не restore в боевую |
| `role "xss" does not exist` | Дамп с `--no-owner`, но роль отсутствует | `docker compose exec postgres psql -U xss -d postgres -c 'CREATE ROLE xss LOGIN;'` |
| `gzip: invalid compressed data` | Обрезанный файл | Проверить `ls -lh`, скачать заново через `GET /api/backups/:name/download` |
| `psql: command not found` | Выполняется на хосте без клиента | Использовать `docker compose exec -T postgres psql` или контейнер backend |
| `permission denied for table` | Дамп от другого пользователя | Восстанавливать от суперпользователя `xss` |

## Эскалация

- При ошибке `psql` приложить первые 50 строк вывода и имя файла бэкапа (без содержимого секретов).
- Если дриль выявляет расхождение в количестве строк, оформить отдельный issue с датой бэкапа и командами воспроизведения; не обновлять боевую БД вручную.
- Подозрение на повреждение файлов бэкапа — немедленно сделать новый снимок и проверить место на диске (`df -h`).
