# Оповещения

Раздел **`/alerts`**, только **ADMIN** (`@Roles(Role.ADMIN)`, JWT; фронтенд пункт меню
«Оповещения» с колокольчиком в группе «Обзор»). Подзаголовок:
«История оповещений и состояние каналов уведомлений».
Страница: `frontend/src/app/alerts/page.tsx`. Две вкладки: **История** и **Настройки**.
Бэкенд: `backend/src/modules/notifications/*` (`notifications.controller.ts`,
`alert-webhook.controller.ts`, `notifications.service.ts`, `notification-routes.controller.ts`,
`notification-settings.service.ts`).

> **Главное про вкладку «История».** Раздел называется «Оповещения», но таблица истории
> **не сканирует систему сама и не подтягивает события панели**. Строки появляются только
> когда бэкенд сохранил алерт, пришедший **извне** через webhook
> `POST /api/notifications/alerts`. Пустая таблица = ещё ни одного такого запроса не было
> (или он отклонён / отфильтрован). Подробности — ниже.

## Вкладка «История»

### Зачем это нужно

Это **журнал (audit-история) входящих алертов** для администратора:

- алерты от системы мониторинга не исчезают после отправки в Telegram/webhook/email/Signal,
  а **сохраняются в БД** и доступны в панели задним числом;
- видно, что произошло, что ещё активно (`firing`), а что уже закрыто (`resolved`),
  с какой важностью, из какого источника, с каким сообщением и когда;
- можно проверить, что конвейер оповещений вообще сработал (пришло ли что-то из Grafana);
- рядом на той же вкладке показано **состояние каналов** доставки
  (`GET /api/notifications/channels`, только факты «настроен/не настроен», **без секретов**);
- сохранённое количество алертов также попадает в `GET /api/monitor/summary`
  (`alerts`, только для не-org токенов со scope `MONITOR`; см. ниже про отсутствие tenant-колонки).

Вкладка «Настройки» отдельно настраивает каналы, матрицу «событие × канал», политику отправки
и содержит **отдельный** «Журнал отправок» (`NotificationDelivery`) — см. ниже; это не то же
самое, что таблица истории `AlertHistory`.

### Что именно показывает таблица

Источник данных: таблица БД **`AlertHistory`** (`backend/prisma/schema.prisma`) через
`GET /api/notifications/alerts` → `NotificationsController.alerts` → `NotificationsService.listAlerts`.
Таблица **read-only**: нет создания/редактирования/удаления, поиска по тексту и действий со
строкой. С сервера строки приходят `ORDER BY createdAt DESC`; `DataTable` дополнительно даёт
клиентскую сортировку колонок кликом по заголовку **в пределах текущей страницы** (не
перезапрашивает сервер; `sorting` наружу не прокидывается). Состояние пусто —
`EmptyState` «Нет данных» (общий текст `DataTable` «Измените фильтры или создайте новую запись»,
хотя создавать здесь нечего). Колонки (тип `AlertRow`, RU-подписи из `frontend/src/lib/i18n.ts`):

| Колонка | Поле | Что выводится |
|---|---|---|
| **Статус** | `status` | Бейдж **«Срабатывание» (`firing`)** (красный, `danger`) vs **«Разрешено» (`resolved`)** (зелёный, `success`). В БД строка произвольная, но UI считает всё, что **не** `resolved`, как `firing`. Фильтр сверху: все / `firing` / `resolved`; параметр `?status=...`, **точное совпадение**; смена фильтра сбрасывает страницу на первую. |
| **Заголовок** | `title` | Имя алерта (см. маппинг ниже); непустая строка. |
| **Важность** | `severity` | Строка, обычно `info` / `warning` / `critical`. Бейдж `critical` → красный (`danger`), остальное → жёлтый (`warning`); пусто → `—`. В БД `nullable`. Отдельно `minSeverity` политики (`info` < `warning` < `critical`, неизвестное значение → `warning`, default `warning`) используется **для отправки в каналы**, а не для записи в историю. |
| **Источник** | `source` | Кто прислал алерт; сейчас всегда `'grafana'` (в `recordAlert` `source || 'grafana'`, default `grafana`). |
| **Сообщение** | `message` | Детали; `nullable`, в UI `—`. |
| **Создано** | `createdAt` | Время получения алерта (`@default(now())`), локализованный `toLocaleString()`; сортировка по убыванию. |

В БД дополнительно хранятся `id` (uuid v4) и `labels` (`Json?`, все лейблы алерта, например
`alertname`, `severity`, `organizationId`); они возвращаются API, но **не выводятся в таблице**.
Индексы: `@@index([createdAt])`, `@@index([status, createdAt])`. Отдельной колонки `updatedAt`
нет.

Над таблицей: четыре карточки каналов (`telegram`, `webhook`, `email`, `signal`,
«подключено / не настроено») из `GET /api/notifications/channels`; `total`; счётчик активных
каналов `N/4`; селект статуса. Внизу — **серверная пагинация** (в UI размер страницы 20,
`onPageSizeChange`), мобильные карточки вместо таблицы на узких экранах.

### Откуда берутся строки

Единственный код, создающий записи в `AlertHistory`, — `NotificationsService.recordAlert()`
(`prisma.alertHistory.create`), и единственный его вызывающий — **`POST /api/notifications/alerts`**
в `backend/src/modules/notifications/alert-webhook.controller.ts`. Проверено поиском по
бэкенду: никакие другие модули в `AlertHistory` не пишут (только `count()` для `/api/monitor/summary`).

#### Webhook `POST /api/notifications/alerts` (`AlertWebhookController`)

- **Не JWT**; защита токеном `Authorization: Bearer $ALERT_WEBHOOK_TOKEN`
  (`process.env.ALERT_WEBHOOK_TOKEN`; префикс `Bearer\s+` снимается; **constant-time**
  сравнение `timingSafeEqual`). Токен не задан → **503** `Alert webhook is not configured`;
  неверный → **401** `Invalid alert token`.
- Тело (`GrafanaPayload`): `{ status?, title?, message?, alerts? }`. `alerts[]`
  (`GrafanaAlert`): `{ status?, labels?, annotations?, startsAt? }`. Если `alerts[]` пуст —
  синтезируется один алерт `{ status: body.status || 'firing',
  labels: { alertname: body.title || 'XSS alert' }, annotations: { description: body.message } }`.
  Один запрос может создать **несколько** строк — по одной на элемент `alerts[]`.
- Маппинг на запись `AlertHistory` (на каждый элемент):
  - `status` = `alert.status || body.status || 'firing'`;
  - `title` = `labels.alertname || annotations.summary || body.title || 'XSS alert'`;
  - `message` = `annotations.description || annotations.message || body.message || null`;
  - `severity` = `labels.severity || null`;
  - `source` = `'grafana'`;
  - `labels` = все `labels` элемента (или `undefined`).
- Записи создаются через `Promise.all`, **независимо от результата отправки** в каналы и от
  политики (`enabled`, `minSeverity`, тихие часы, cooldown) — те влияют только на доставку,
  **не на историю**. `persisted` = число созданных записей.
- Ответ: `{ received, persisted, ...channels }`, где `received` = длина исходного `alerts[]`
  (0, если массив пуст, хотя `persisted=1`), `channels` = `NotificationsService.emit(...)` →
  `Record<name, { sent, reason?, error? }>`, возможно с ключом `policy`
  `{ sent:false, reason }`, когда отправка пропущена политикой.

#### Параллельная отправка в каналы (`NotificationsService.emit`)

Один вызов `emit(...)` на запрос (не на каждый `alerts[]`), **не пишет в `AlertHistory`**:

- `eventFromAlertLabels(...)`: `labels.event || labels.notificationEvent || labels.alertname
  || title`, upper-case; точное вхождение `Object.values(NotificationEvent)`; иначе подстроки
  `traffic→TRAFFIC_ALERT`, `backup→BACKUP_FAILED`, `config→CONFIG_APPLIED`,
  `payment→PAYMENT_RECEIVED`, `online`&&!`offline→NODE_ONLINE`, `offline`||`node→NODE_OFFLINE`;
  дефолт **`TRAFFIC_ALERT`**.
- тип события (`NotificationEvent`, 8): `NODE_OFFLINE`, `NODE_ONLINE`, `TRAFFIC_ALERT`,
  `USER_EXPIRED`, `BACKUP_FAILED`, `CONFIG_APPLIED`, `PAYMENT_RECEIVED`, `CHEBURCHECK_BLOCKED`.
- `severity` = первый `alerts[].labels.severity`, иначе `warning` при `body.status==='firing'`,
  иначе `info`.
- `organizationId` = первый `alerts[].labels.organizationId`, иначе `null` (маршрутизация).
- `dedupeKey` = `event:title || event:grafana`.
- текст: строки `🔴/✅ name — value`; `subject` = `body.title || 'XSS alert'`.
- фильтры политики (см. «Правила отправки»); каналы из `GET/POST /api/notification-routes`.
- каждая попытка доставки в канал пишется в **`NotificationDelivery`** (`status=sent|failed`,
  `error`, `dedupeKey`, ...), ошибка `error` обрезается до 500 символов; сбой записи журнала
  только логируется (`Delivery log failed`), не роняет запрос.

#### Бандл-мониторинг (Grafana)

`docs/monitoring.md`, `README*`. Опциональный стек `make monitoring`
(`docker compose --profile monitoring`; k8s `k8s/monitoring*.yaml`). Contact point Grafana →
`POST http://backend:3000/api/notifications/alerts`, `Authorization: Bearer $ALERT_WEBHOOK_TOKEN`.
`ALERT_WEBHOOK_TOKEN` в `.env` (длинный случайный, передаётся Grafana через docker-compose;
в k8s — из Secret `xss-secrets`). Файловые правила
`monitoring/grafana/provisioning/alerting/alerts.yml` (+ `k8s/monitoring-config.yaml`), изменять
YAML и перезапускать Grafana; группировка `group_by=['alertname','severity']`, `group_wait=30s`,
`group_interval=5m`, `repeat_interval=12h`. Встроенные правила:

| `alertname` | Условие | severity |
|---|---|---|
| `XSS backend is down` (`xss-backend-down`) | `up{job="xss-backend"}==0` 1 мин | `critical` |
| `XSS node is offline` (`xss-node-offline`) | registered nodes > online 2 мин | `critical` |
| `XSS backend high memory` (`xss-backend-memory`) | backend RSS > 512 MiB 5 мин | `warning` |
| `XSS node CPU high` (`xss-node-cpu-high`) | node CPU > 85% 5 мин | `warning` |

То есть при работающем стеке таблица должна наполняться строками с этими заголовками,
`status=firing`, при восстановлении — `resolved`, источник `grafana`.

### Что НЕ попадает в таблицу `AlertHistory`

- **Внутренние события самой панели.** `NotificationsService.emit(...)` вызывается изнутри:
  `NODE_OFFLINE`/`NODE_ONLINE` (health-checks / TLS-eye проверки доступности нод),
  `BACKUP_FAILED` (backup scheduler), `CONFIG_APPLIED`, `PAYMENT_RECEIVED`, `CHEBURCHECK_BLOCKED`.
  Они **только** шлют в настроенные каналы и пишут `NotificationDelivery`, **не**
  `AlertHistory`. В истории они появятся, только если прийдут через внешний webhook.
  **`TRAFFIC_ALERT` и `USER_EXPIRED` не эмитятся внутри панели в этом репозитории**:
  `TRAFFIC_ALERT` — ещё и дефолт `eventFromAlertLabels` для неизвестных алертов из внешнего
  webhook; `USER_EXPIRED` — только enum, матрица, тесты и внешние лейблы
  `event`/`notificationEvent`/`alertname`. Итог: **нода офлайн / истёкший пользователь / оплата /
  провал бэкапа / трафик-алерт в «Истории» `AlertHistory` не видны**, если их не прислали через
  webhook — смотрите «Журнал отправок» и каналы.
- **Ручной тест.** `POST /api/notifications/test` → `NotificationsService.broadcast(...)`:
  шлёт тестовое сообщение (опционально в один `channel`, `text`), **не** пишет ни `AlertHistory`,
  ни `NotificationDelivery`. Кнопка «Тест канала» ничего в историю не добавляет. `broadcast()`
  **не** применяет политику `NotificationPolicy`.
- **Заблокированные/невалидные запросы** к webhook (503/401/500) не создают записей.

### API истории

`GET /api/notifications/alerts` (JWT, **ADMIN**):

- `page` — ≥1, default `1`;
- `limit` — default `20`, clamp 1..100;
- `status` — точное совпадение по `status`, если задан;
- ответ `{ data, total, page, limit }`, `data` — массив `AlertHistory`, `total` для пагинации.

`POST /api/notifications/alerts` — см. выше (отдельная, не-JWT защита `ALERT_WEBHOOK_TOKEN`).
Дополнительно `GET /api/notifications/channels`, `GET /api/notifications/deliveries`,
`GET/PATCH /api/notifications/settings`, `POST /api/notifications/test`,
`GET/POST /api/notification-routes`, `GET /api/notifications/telegram/diagnose`,
`PATCH /api/notifications/relay-node` — всё ADMIN (кроме `notification-routes`, см. ниже).

### Почему таблица пустая (чек-лист)

1. **Ещё ничего не пришло.** Ни один внешний источник не вызвал `POST /api/notifications/alerts`.
   Внутренние события панели сюда не пишут (см. выше).
2. **Мониторинг не поднят/не настроен.** Нет `make monitoring`, contact point Grafana, файловых
   правил; или ничего не сработало по условию.
3. **`ALERT_WEBHOOK_TOKEN`.** Не задан на backend → 503; отправитель использует другой токен →
   401. Ошибка запроса отображается вверху таблицы, но строк не будет.
4. **Проверь ответ webhook.** `received`/`persisted`, `channels`. `persisted=0` → ничего не сохранено.
5. **Фильтр «Статус».** Выставлен `firing`/`resolved`, а записей нет; сбрось на «все».
   Проверь `GET /api/notifications/alerts?page=1&limit=20`.
6. **Пагинация.** Строки на следующих страницах; `total` > 0.
7. **Роль.** Не ADMIN / нет JWT → доступ запрещён.
8. **Ошибка загрузки.** `GET` упал (`setError`) — смотри сообщение и логи backend.
9. **Это не журнал отправок.** Сообщение ушло в Telegram, но история `AlertHistory` пуста, если
   источник не webhook; доставки смотри в «Настройки → Журнал отправок» / `NotificationDelivery`.

### Как проверить вручную

См. `docs/monitoring.md`, `docs/runbooks/incident-node-offline.md`:

```bash
curl -X POST http://localhost:3000/api/notifications/alerts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" \
  -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"smoke test","severity":"warning"}}]}'
```

После этого в `/alerts` → «История» должна появиться строка: `firing`, заголовок `smoke test`,
важность `warning`, источник `grafana`, сообщение `—`, текущее время. Покрытие e2e:
`backend/test/app.e2e-spec.ts`, `backend/test/postgres.e2e-pg-spec.ts`,
`backend/test/notification-routing.e2e-pg-spec.ts`, `alert-webhook.controller.spec.ts`.

## Вкладка «Настройки»

### Каналы

Реквизиты редактируются в UI и хранятся в БД **`NotificationCredential` зашифрованно**
(AES-256-GCM, `PANEL_MASTER_KEY`, `backend/src/common/secret-crypto.ts`); секреты **write-only**
(не возвращаются в UI/API). Если записи в БД нет — используется `.env` (обратная совместимость).
Обновляются только переданные ключи; **непустое** значение → upsert шифрованного; **пустое**
(`''`/`null`) → `deleteMany` сохранённой записи с fallback на `.env`. В UI неизменённые поля
просто не отправляются («пустое поле = оставить текущее»); безопасные (non-secret) сохранённые
значения возвращаются в `values` для повторного показа.

API:
- `GET /api/notifications/settings` — `{ configured, policy, values }`, **никогда не возвращает
  секреты**; `values` только non-secret; `configured` — какие ключи заданы (БД или env);
- `PATCH /api/notifications/settings` — `{ credentials?, policy? }`, перед сохранением создаётся
  snapshot `@SnapshotBefore('settings', 'Notification policy update')`; ошибки валидации → 400.

Поддерживаемые ключи `NOTIFICATION_CREDENTIAL_KEYS`:
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`;
- webhook: `WEBHOOK_URL`, `WEBHOOK_SECRET`;
- email/SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `ALERT_EMAIL_TO`;
- Signal: `SIGNAL_API_URL`, `SIGNAL_PHONE_NUMBER`, `SIGNAL_RECIPIENT`;
- Cheburcheck: `CHEBURCHECK_API_TOKEN`, `CHEBURCHECK_BASE_URL` (см. `docs/cheburcheck.md`);
- ретрансляция через ноду: `NOTIFICATION_VIA_NODE_ID` (`PATCH /api/notifications/relay-node`,
  см. in-app доку «Уведомления через ноду»; SMTP всегда напрямую с панели);
- прочее хранимое: `TELEGRAM_REPORT_INTERVAL_MS`, `NODE_DIGEST_INTERVAL_MS`.

Каналы доставки (`NotificationChannel`): `TELEGRAM`, `WEBHOOK`, `EMAIL`, `SIGNAL`.

**Telegram**: `POST https://api.telegram.org/bot<token>/sendMessage`, `parse_mode=HTML`,
`GET /api/notifications/telegram/diagnose` (sanitized, токен не возвращается, `firstChatId` из
`getUpdates`); кнопка «найти chat id». **Webhook**: JSON, `X-XSS-Signature: sha256=<HMAC-SHA256
секрет>` при `WEBHOOK_SECRET`; в production только **HTTPS**, **приватные/metadata** адреса
запрещены (SSRF, включая numeric/hex IPv4 и `::ffff:`), редиректы не разворачиваются, таймаут
8 с; **тело ответа провайдера не возвращается в UI и не логируется**. **Email**: SMTP
(`EMAIL_FROM`/`SMTP_USER`, `ALERT_EMAIL_TO`, `SMTP_SECURE`), plain text. **Signal**:
`signal-cli-rest-api` `POST {url}/v2/send`. Исходящие запросы можно выпускать через ноду
(`NOTIFICATION_VIA_NODE_ID`, SSH `forwardOut`, jump node, 8 с); неудача → `{sent:false,error}`
+ запись в `NotificationDelivery`, причина попадает в результат канала и журнал.

**Тест канала.** Кнопка «Тест канала» / `POST /api/notifications/test { channel?, text? }` →
`broadcast(...)` (Telegram HTML-тест, «XSS: test notification»); **не пишет историю/журнал**;
`POST /api/notifications/test` без `channel` — broadcast во все.

### События и каналы (матрица)

`GET /api/notification-routes`, `POST /api/notification-routes { event, channel, enabled }`
(`NotificationRoute`, `@@unique([event, channel, organizationId])`, `organizationId`
nullable; `organizationId=null` → глобальный). Маршрут `event × channel × enabled`.
Контроллер `@Controller('notification-routes')`, `@UseGuards(AuthGuard('jwt'), RolesGuard)`,
**`@Roles(ADMIN, OPERATOR)`**. ADMIN — глобальные маршруты (`organizationId=null`); OPERATOR —
маршруты своей организации (`user.organizationId`; для org-scoped OPERATOR `list` отдаёт только
свои, `set` пишет `organizationId = user.organizationId ?? null`; OPERATOR без организации по
факту работает с `null`/глобальными — см. `notification-routes.service.ts`). `emit(..., organizationId?)` маршрутизирует
**`organizationId=null OR organizationId`**, дедуп по каналу. `GET/POST /api/notification-routes`
(не `/notifications/routes`; `docs/api.md` упоминает оба варианта и лишний `X-API-Token
NOTIFICATIONS`, фактически контроллер использует JWT — см. `notification-routes.controller.ts`).
Матрица на странице показывает **8 событий**:
`NODE_OFFLINE`, `NODE_ONLINE`, `TRAFFIC_ALERT`, `USER_EXPIRED`, `BACKUP_FAILED`, `CONFIG_APPLIED`,
`PAYMENT_RECEIVED`, `CHEBURCHECK_BLOCKED` × `TELEGRAM`, `WEBHOOK`, `EMAIL`, `SIGNAL`.
(Источник в истории `AlertHistory` от этого не зависит; `USER_EXPIRED` см. выше.)

### Правила отправки

`NotificationPolicy` (одна запись `id=default`; `GET/PATCH /api/notifications/settings`,
`policy`, JWT ADMIN; `@SnapshotBefore` на PATCH). Проверки в `NotificationsService.emit()`
**перед отправкой**, на бэкенде; **не влияют на запись в `AlertHistory`**:

- `enabled` — глобальный выключатель (default `true`); `false` → `policy: notifications disabled`;
- `minSeverity` — `info`(0) < `warning`(1) < `critical`(2), default `warning`; unknown→1;
  `options.severity` (default `warning`) ниже порога → `policy: severity below X`;
- `quietHoursStart` / `quietHoursEnd` — тихие часы **UTC**, `HH:MM`, `[start,end)`, переход через
  полночь поддержан; пусто → выключено; `policy: quiet hours`;
- cooldown по `dedupeKey` (`NotificationDelivery` с `status='sent'` за окно, default `event`;
  `minutes<=0` → нет cooldown; `policy: cooldown`; если хранилище `NotificationDelivery`
  недоступно — `withinCooldown` возвращает `false`, отправка не блокируется). **Текущая
  реализация `emit()` НЕ читает `policy.cooldownMinutes` для паузы** (оно сохраняется/валидируется
  0–1440 и показано в UI, но всегда перезаписывается). Эффективные поля (`NotificationPolicy`,
  `notification-schedule-down.sql`, диапазон 0–10080 через `setPolicy`):
  - `infoIntervalMinutes` (non-error события, default 60; `<=0` → `event disabled by schedule`);
  - `errorRepeatMinutes` (error-события `NODE_OFFLINE`, `BACKUP_FAILED`, `TRAFFIC_ALERT`,
    default `0`; `0`→10080 мин; отрицательное → `event disabled by schedule`; `CHEBURCHECK_BLOCKED`
    идёт первой веткой ниже и `errorRepeatMinutes` не использует);
  - `cheburcheckIntervalMinutes` (`CHEBURCHECK_BLOCKED`, default 360; `<=0` → `event disabled by schedule`);
  - `cooldownMinutes` (сохраняется, 0–1440, UI «cooldown», **сейчас не применяется** в `emit()`);
- `escalationChannel` — **зарезервированное поле**, сохраняется, но эскалация во второй канал
  **не отправляется**.

### Журнал отправок (`NotificationDelivery`, вкладка «Настройки»)

Отдельно от `AlertHistory`. Каждый `emit()` в каждый канал пишет `{ event, channel,
status: sent|failed, dedupeKey, error, createdAt }`. `GET /api/notifications/deliveries?limit`
(ADMIN; default 50, clamp 1..200, `orderBy createdAt DESC`, `error` ≤500; UI limit=50, «Журнал
отправок», `t.noData` если пусто). `broadcast()` (тест) **не** пишет. Cooldown смотрит сюда же
(`status='sent'`). Если алерт сохранён в `AlertHistory`, но не уходит в каналы — причина в
`NotificationDelivery.error`, в результате `channels`, в логах `NotificationsService`, и/или
`policy:*`; см. `docs/runbooks/incident-node-offline.md`, `docs/runbooks/k8s-monitoring-troubleshoot.md`.

## Каналы `GET /api/notifications/channels`

`{ telegram, webhook, email, signal }` bool (только факты «настроен», **без секретов**):
`telegram = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID`; `webhook = WEBHOOK_URL`;
`email = SMTP_HOST && (EMAIL_FROM || SMTP_USER)`;
`signal = SIGNAL_API_URL && SIGNAL_PHONE_NUMBER && SIGNAL_RECIPIENT`. ADMIN.

## Идеи из других панелей

- **Mistgate**: Telegram-алерты, каждый администратор привязывает свой чат, тестовое сообщение.
- **3x-ui / LucX-UI**: Telegram и Discord боты для мониторинга и управления.
- **Remnawave**: тонкая настройка уведомлений, вебхуки и биллинговые алерты по нодам.

Реализовано в этом MVP: история `AlertHistory`, матрица событий, зашифрованные реквизиты, SIGNAL,
тихие часы, cooldown/интервалы, порог важности, тест канала, журнал отправок, ретрансляция через
ноду, Cheburcheck-настройки. Per-admin Telegram chat, эскалация и шаблоны сообщений — следующий этап.

## Ограничения

- Реквизиты каналов глобальные для инстанса, не per-admin.
- `ALERT_EMAIL_TO` — один адрес на инстанс; уведомления об оплате идут туда же.
- Поле `escalationChannel` пока сохраняется, но эскалация во второй канал не отправляется.
- `cooldownMinutes` сохраняется, но в текущем `emit()` паузу задают `infoIntervalMinutes` /
  `errorRepeatMinutes` / `cheburcheckIntervalMinutes` (см. выше).
- `policy` в `NotificationPolicy` влияет **только на доставку**, не на запись в `AlertHistory`.
- **`AlertHistory` не имеет tenant-колонки** (`organizationId`): история глобальна, `listAlerts`
  не фильтрует по организации, доступ только ADMIN; `GET /api/monitor/summary` скрывает
  `alerts` (`null`) для org-scoped токенов (комментарий в коде). `NotificationDelivery` и
  `notification-routes` организации поддерживают, история `AlertHistory` — нет.
- Источник `source` сейчас всегда `grafana`; произвольные внешние отправители должны
  использовать `POST /api/notifications/alerts` с `ALERT_WEBHOOK_TOKEN`, но `source` они не задают.
- `startsAt` из Grafana (`GrafanaAlert.startsAt`) **не сохраняется** в `AlertHistory`; он
  передаётся каналам внутри `webhook.alerts`. `createdAt` строки — время получения панелью, не
  время начала алерта в мониторинге.
- `POST /api/notifications/test` не создаёт историю и не применяет политику.
- Карточные данные не хранятся; платёжные вебхуки проверяются отдельно в `PaymentsService`.

## Связанные документы

- `docs/monitoring.md` — Grafana/Prometheus, `ALERT_WEBHOOK_TOKEN`, smoke-test.
- `docs/api.md` — API Notifications.
- `docs/settings-hub.md` — notification policy в Settings → Notifications / Alerts → Settings.
- `docs/cheburcheck.md` — Cheburcheck + `CHEBURCHECK_*`.
- in-app `/docs` (`frontend/src/lib/docs-content.ts`, id `notifications-via-node`, блок «Оповещения»
  в «Бэкапы и мониторинг») — краткая версия.
- `docs/runbooks/incident-node-offline.md`, `docs/runbooks/k8s-monitoring-troubleshoot.md`.
