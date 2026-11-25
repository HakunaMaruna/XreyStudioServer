# Оповещения

Раздел `/alerts` ADMIN-only. Две вкладки: **История** и **Настройки**.

## История

Таблица `AlertHistory` с фильтром firing/resolved и пагинацией; карточки статуса каналов
`GET /api/notifications/channels` (только факты «настроен/не настроен»).

## Настройки

### Каналы

Реквизиты редактируются в UI и хранятся в БД зашифрованно (AES-256-GCM, `PANEL_MASTER_KEY`,
как в `backend/src/common/secret-crypto.ts`). Пустое поле = оставить текущее значение.
Если записи в БД нет, используется `.env` (обратная совместимость).

API:
- `GET /api/notifications/settings` — `{ configured, policy }`, **никогда не возвращает секреты**;
- `PATCH /api/notifications/settings` — `{ credentials, policy }`.

Поддерживаемые ключи: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_URL`,
`WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`,
`ALERT_EMAIL_TO`, `SIGNAL_API_URL`, `SIGNAL_PHONE_NUMBER`, `SIGNAL_RECIPIENT`.

Исходящий webhook:
- в production только HTTPS; приватные и metadata-адреса запрещены (защита от SSRF);
- таймаут 8 с;
- при заданном `WEBHOOK_SECRET` заголовок `X-XSS-Signature: sha256=<HMAC>`;
- тело ответа провайдера не возвращается в UI и не логируется.

Кнопка «Тест канала» отправляет тестовое сообщение выбранным каналом.

### События и каналы (матрица)

`GET/POST /api/notification-routes`: маршрут `event × channel × enabled`, в том числе
`SIGNAL` (добавлен в `NotificationChannel`). OPERATOR видит и меняет только маршруты
своей организации, ADMIN — глобальные. Матрица на странице показывает 7 событий:
NODE_OFFLINE, NODE_ONLINE, TRAFFIC_ALERT, USER_EXPIRED, BACKUP_FAILED, CONFIG_APPLIED,
PAYMENT_RECEIVED.

### Правила отправки

`NotificationPolicy` (одна запись `id=default`):
- `enabled` — глобальный выключатель;
- `quietHoursStart` / `quietHoursEnd` — тихие часы в UTC, формат HH:MM, поддерживается
  переход через полночь;
- `cooldownMinutes` — пауза между повторами с тем же `dedupeKey` (0–1440);
- `minSeverity` — минимальная важность (`info` < `warning` < `critical`);
- `escalationChannel` — зарезервированное поле для следующего этапа.

Проверка правил выполняется в `NotificationsService.emit()` на стороне бэкенда перед
отправкой; результат каждой попытки пишется в `NotificationDelivery` и виден в журнале.

## Идеи из других панелей

- **Mistgate**: Telegram-алерты, каждый администратор привязывает свой чат, тестовое сообщение.
- **3x-ui / LucX-UI**: Telegram и Discord боты для мониторинга и управления.
- **Remnawave**: тонкая настройка уведомлений, вебхуки и биллинговые алерты по нодам.

Реализовано в этом MVP: матрица событий, зашифрованные реквизиты, SIGNAL, тихие часы,
cooldown, порог важности, тест канала и журнал отправок. Per-admin Telegram chat,
эскалация и шаблоны сообщений — следующий этап.

## Ограничения

- Реквизиты каналов глобальные для инстанса, не per-admin.
- `ALERT_EMAIL_TO` — один адрес на инстанс; уведомления об оплате идут туда же.
- Поле `escalationChannel` пока сохраняется, но эскалация во второй канал не отправляется.
- Карточные данные не хранятся; платёжные вебхуки проверяются отдельно в `PaymentsService`.
