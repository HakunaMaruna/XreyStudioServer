# Статистика установок (telemetry)

Панель может добровольно отправлять на главный сервер агрегированные счётчики
установки. Соглашение: `docs/telemetry-license.md`. Управление: `/telemetry`.

## Поток

1. При первом входе в панель администратор видит модальное окно со ссылкой на
   лицензионное соглашение и выбором «Разрешить отправку» / «Не отправлять».
   Выбор сохраняется в таблице `TelemetrySetting` (accepted=true, enabled=true/false).
2. Если отправка разрешена и задан `TELEMETRY_URL`, панель отправляет REPORT
   через 60 секунд после старта и затем каждые 6 часов
   (`TELEMETRY_INTERVAL_MS`, минимум 1 час рекомендуется).
3. Главный сервер принимает POST `/api/telemetry/ingest` с токеном API, у которого
   есть scope `TELEMETRY`, и сохраняет установку, снимок и обезличенные события
   в таблицах `TelemetryInstallation`, `TelemetrySnapshot`, `TelemetryLog`.
4. Сводка доступна администратору главного сервера в `/telemetry` и через
   `GET /api/telemetry/installations`, `GET /api/telemetry/logs`.

## Переменные окружения

```text
# На клиентской панели (tenant):
TELEMETRY_URL=https://msc.h2onetwork.pro/api
TELEMETRY_TOKEN=xss_<токен со scope TELEMETRY>
TELEMETRY_INTERVAL_MS=21600000
```

`TELEMETRY_TOKEN` — обычный API-токен панели, создаваемый в разделе API-токенов
с единственным scope `TELEMETRY`. Он не даёт доступа к данным панели.

## API

| Метод | Путь | Доступ | Что делает |
|---|---|---|---|
| GET | `/api/telemetry/status` | любой авторизованный | статус согласия и ID установки |
| GET | `/api/telemetry/preview` | ADMIN/OPERATOR | данные, которые будут отправлены |
| POST | `/api/telemetry/consent` | ADMIN/OPERATOR | `{ accepted, enabled }` |
| POST | `/api/telemetry/send` | ADMIN/OPERATOR | отправить сейчас |
| POST | `/api/telemetry/ingest` | API-токен scope `TELEMETRY` | приём отчёта (главный сервер) |
| GET | `/api/telemetry/installations` | ADMIN/OPERATOR | список установок |
| GET | `/api/telemetry/logs?limit=100` | ADMIN/OPERATOR | журнал событий |

## Безопасность

- `installId` генерируется случайно (`randomUUID`), не привязан к домену или IP.
- `ingest` принимает только whitelist счётчиков и событий; лишние поля игнорируются.
- Нет произвольного текста от клиента: сообщения логов формируются на сервере.
- Лимиты: не более 64 счётчиков, не более 32 событий, `installId` до 128 символов.
- Таймаут запроса 15 секунд; отправка не блокирует старт панели.
- Миграции обратимы: `backend/prisma/telemetry-down.sql`.
