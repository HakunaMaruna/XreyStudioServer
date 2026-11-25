# Обновления панели и агентов

Панель следит за релизами, показывает доступное обновление на дашборде и умеет обновлять
себя и агентов на нодах. Проверка никогда не меняет версию автоматически: решение всегда
за администратором.

## Откуда берётся информация

| Источник | Переменная | По умолчанию |
| --- | --- | --- |
| GitHub Releases | `UPDATE_REPO` | `HakunaMaruna/XreyStudioServer` |
| GitHub токен (приватный репозиторий / лимиты API) | `GITHUB_TOKEN` | — |
| Свой JSON-эндпоинт (`{version,url,notes,publishedAt}`) | `UPDATE_CHECK_URL` | — |
| Базовый URL GitHub API (GitHub Enterprise / прокси) | `UPDATE_CHECK_BASE_URL` | `https://api.github.com` |
| Время жизни кэша результата | `UPDATE_CHECK_TTL_SECONDS` | `900` |
| Таймаут запроса | `UPDATE_CHECK_TIMEOUT_MS` | `5000` |

Если задан `UPDATE_CHECK_URL`, он имеет приоритет над GitHub Releases — это удобно для
закрытых сетей и зеркал. Ошибка сети не ломает панель: статус возвращается с полем
`error`, а последний успешный результат остаётся в кэше.

Текущая версия панели — `APP_VERSION` в `backend/src/version.ts` (и `frontend/src/lib/version.ts`,
который генерируется из `package.json`). Текущая версия агента — `agent/package.json`;
агент сообщает её панели при регистрации и в метриках.

## Настройки

Раздел **Настройки → Обновления** (`backups/panel-settings.json`):

- `updateCheckEnabled` — включить проверку (по умолчанию `true`). Если выключить, панель
  не ходит в сеть, а статус помечается как `disabled`.
- `updateChannel` — `stable` (релизы без пре-релиза) или `dev` (включая `-rc`/`-beta`).

Изменения применяются после «Сохранить»; статус перепроверяется сразу.

## Дашборд

Если доступна версия новее текущей, над метриками появляется баннер с версией, ссылкой на
релиз и кнопкой **Обновить**. Там же показывается количество нод с устаревшим агентом.
Оператор (`OPERATOR`) видит баннер, но применять обновление может только `ADMIN`
(`canApply` в ответе API).

## API

| Метод | Роль | Назначение |
| --- | --- | --- |
| `GET /api/updates/status` | ADMIN, OPERATOR | Текущая/последняя версия, статус агентов, режим применения |
| `POST /api/updates/check` | ADMIN | Принудительная проверка (игнорирует кэш) |
| `POST /api/updates/apply` | ADMIN | Запуск обновления панели через updater (аудит `update.apply`) |
| `POST /api/updates/verify` | ADMIN | Проверка Ed25519-подписи бандла (`UPDATE_PUBLIC_KEY`) |

`apply` принимает необязательный `{ "targetVersion": "v2.33.0" }` (можно без `v` — префикс
подставится сам); без него ставится последняя версия канала.

## Автообновление панели (sidecar updater)

Панель не получает доступ к docker-сокету. Обновление выполняет отдельный контейнер
`updater`, который видит каталог репозитория и сокет Docker:

```bash
# в .env должен быть UPDATER_TOKEN (install.sh генерирует его автоматически)
docker compose --profile updater up -d updater
```

Что делает updater по `POST /apply`:

1. `git fetch --tags` и `git checkout` нужного тега (или возврат на ветку и `git pull --ff-only`);
2. `docker compose build backend frontend agent`;
3. `docker compose up -d --no-deps backend frontend agent`.

Установка тега оставляет репозиторий в detached HEAD, поэтому перед обновлением «до
последней версии» updater возвращается на ветку: имя берётся из текущего HEAD, а если HEAD
отвязан — первая локальная ветка (`main`, `master` и т. п.). После этого обычный
`git pull --ff-only` снова работает. Так же поступает и обновление агента, и `make update`.

Имя compose-проекта берётся из метки `com.docker.compose.project` текущего контейнера,
поэтому существующие тома и сеть не пересоздаются. Одновременно может выполняться только
одно обновление; лог (последние 64 КБ) доступен в `GET /status` и показывается в модалке
панели. Сайдкар слушает только внутреннюю сеть compose (`http://updater:7070`), наружу
порт не публикуется, все запросы требуют `UPDATER_TOKEN`.

Если сайдкар не запущен (или `UPDATER_TOKEN` пуст), `apply.mode = manual`: панель
показывает готовую команду (`UPDATE_MANUAL_COMMAND`, по умолчанию `make update`) вместо
кнопки запуска. Это же поведение — безопасный откат: остановите профиль `updater`.

```bash
docker compose --profile updater stop updater   # вернуться к ручному режиму
```

## Обновление агентов на нодах

Агент не обновляет сам себя. Панель подключается к ноде по SSH (тот же механизм, что и
мастер настройки узла, `SSH_PROVISION_ENABLED=true`) и выполняет:

```bash
cd <repoDir>
git fetch --tags --force origin
git checkout <тег>                    # либо возврат на ветку и git pull --ff-only
docker compose build agent && docker compose up -d --no-deps agent
```

Кнопка доступна в **Ноды → строка ноды → Обновить агент**. Нужны хост, порт, пользователь,
отпечаток host key (`SHA256:...`) и пароль или приватный ключ; секреты не сохраняются.
Обновляется только контейнер агента, конфигурация Xray и данные не затрагиваются.
Устаревшим считается агент, чья версия не совпадает с версией панели.

Эндпоинт: `POST /api/node-provision/:nodeId/update` (ADMIN, аудит `node.updateAgent`),
таймаут выполнения — 10 минут.

## Ручное обновление

```bash
make backup      # резервная копия БД
make update      # вернуться на ветку, git pull, build, up -d
```

Схема БД применяется автоматически (`prisma db push`) при старте backend.

## Ограничения

- Проверка обновлений не планируется по расписанию: статус запрашивается при открытии
  дашборда/настроек и по кнопке, результат кэшируется на `UPDATE_CHECK_TTL_SECONDS`.
- Updater обновляет только backend, frontend и agent. Изменения в `docker-compose.yml`
  (новые сервисы, тома) применяйте вручную через `make update`.
- В режиме `control` (`docker-compose.control.yml`) сервиса `updater` нет — обновляйте вручную;
  перед `POST /api/updates/apply` автоматически создаётся снапшот (`autoBeforeUpdates`).
- Откат панели — `git checkout <предыдущий тег> && docker compose build && docker compose up -d`
  на сервере (без `git pull`: он вернул бы ветку на последнюю версию) или
  `POST /api/updates/apply` с `{"targetVersion": "<тег>"}`.
- `make update` обновляет нужный compose-стек: `docker-compose.control.yml` в CONTROL-режиме
  (по `PANEL_MODE=control` в `.env`), иначе `docker-compose.yml`. Он всегда возвращает
  репозиторий на ветку и тянет её последнюю версию.

## Rollback

The database part of the update system is limited to `Node.agentVersion` and
`Node.agentUpdatedAt`. To remove it:

```bash
psql "$DATABASE_URL" -f backend/prisma/update-down.sql
```

The updater container, environment variables and API endpoints are code/config only.
