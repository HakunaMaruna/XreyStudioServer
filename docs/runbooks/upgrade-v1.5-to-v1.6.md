# Обновление v1.5.0 → v1.6.0

## Симптомы

- Внизу бокового меню и в `frontend/package.json` всё ещё `1.5.0`, тёмная тема и новые компоненты UI отсутствуют.
- Нужно перейти на v1.6.0 без потери данных и без изменения схемы БД (между v1.5.0 и v1.6.0 миграций Prisma нет).
- Контейнеры собраны из старых исходников: `docker compose ps` показывает образы, созданные до перехода.

## Проверки перед обновлением

1. Убедиться, что текущая версия действительно v1.5.0:
   ```bash
   node -p "require('./backend/package.json').version + ' / ' + require('./frontend/package.json').version"
   git describe --tags --exact-match HEAD
   ```
2. Проверить, что бэкап свежий (см. `backup-restore-drill.md`).
3. Проверить, что все сервисы здоровы:
   ```bash
   docker compose ps
   curl -fsS http://127.0.0.1:3000/api/health/ready
   ```

## Команды

```bash
cd /opt/XreyStudioServer
export DEPLOY_DIR=/opt/XreyStudioServer
export BACKUP_FILE=backups/db-$(date -u +%Y%m%d-%H%M%S).sql.gz

# 1. Резервная копия перед обновлением
$DEPLOY_DIR/scripts/backup.sh
test -s "$DEPLOY_DIR/$BACKUP_FILE" && gzip -t "$DEPLOY_DIR/$BACKUP_FILE"

# 2. Переключение на тег v1.6.0
cd "$DEPLOY_DIR"
git fetch origin --tags
git checkout v1.6.0

# 3. Синхронизация схемы (идентиpotent; для v1.6.0 изменений схемы нет)
docker compose up -d postgres redis
docker compose exec -T backend npx prisma db push --skip-generate

# 4. Пересборка и запуск
docker compose build
docker compose up -d
docker compose ps
```

> Если используется Kubernetes: замените шаги 3–4 на `docker build -t xss-backend:1.6.0 ./backend`
> (аналогично frontend/agent), загрузку образов в кластер и `kubectl apply -k k8s`, затем
> `kubectl -n xss rollout status deployment/backend`.

## Проверки после деплоя

```bash
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD='strong-admin-password'
export ADMIN_TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')

node -p "require('./frontend/package.json').version"
curl -fsS http://127.0.0.1:3000/api/health/ready
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" 'http://127.0.0.1:3000/api/users?limit=1'
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3000/api/payments/plans
curl -fsS http://127.0.0.1:9090/health
```

## Ожидаемый результат

- `node -p ...` выводит `1.6.0 / 1.6.0`, `git describe` — `v1.6.0`.
- `prisma db push` завершается без ошибок, все контейнеры в статусе `Up (healthy)`.
- `/api/health/ready` возвращает JSON со статусом готовности, запросы с JWT возвращают `200`.
- В UI доступны страницы `/backups`, `/traffic`, `/audit`, `/reports` (последняя — только в v1.7.0) и тёмная тема.

## Откат

```bash
cd /opt/XreyStudioServer
git checkout v1.5.0
docker compose build
docker compose up -d
docker compose exec -T backend npx prisma db push --skip-generate
curl -fsS http://127.0.0.1:3000/api/health/ready
```

Если вместе с откатом нужно вернуть данные:

```bash
./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.sql.gz
```

Схема v1.5.0 и v1.6.0 совместима, поэтому откат без восстановления БД безопасен, если на v1.6.0 не создавались новые записи.

## Эскалация

- Ошибка `prisma db push` или `relation already exists` — остановить деплой, приложить полный вывод и проверить `DATABASE_URL` в `.env`; не выполнять `prisma db reset` на боевой БД.
- Неудачный `docker compose build` (отсутствуют `node_modules/.bin`) — проверить, что Dockerfiles используют `npm ci`, и приложить логи сборки.
- Если health-check не проходит после отката — эскалировать с логами `docker compose logs --tail=300 backend` и именем последнего успешного бэкапа.
