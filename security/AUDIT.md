# Security audit — XreyStudioServer

Проверено: ветка `main`, коммит `0ff674b` (код идентичен релизу v1.8.3, отличаются только строки версий/зависимости). Аудит read-only, исходный код не менялся.

## Сводка

| # | Уровень | Находка |
|---|---|---|
| 1 | HIGH | Dev-секреты JWT/admin, если `NODE_ENV` не задан |
| 2 | HIGH | Конфиг ноды содержит пользователей и токены всех арендаторов |
| 3 | HIGH | Агент `:9090` опубликован + дефолтный `change-me-agent-token` |
| 4 | MEDIUM | `GET /api/users/:id` доступен USER и отдаёт `subscriptionToken` |
| 5 | MEDIUM | OPERATOR задаёт произвольный `organizationId` |
| 6 | MEDIUM | Audit/Reports/Traffic/Payments без tenant isolation |
| 7 | MEDIUM | SSRF через `agentUrl`,打开тый канал «панель → агент» |
| 8 | MEDIUM | Не-constant-time сравнения токенов |
| 9 | MEDIUM | Токен подписки в URL/логах/Referer, нет `Cache-Control: no-store` |
| 10 | MEDIUM | `NEXT_PUBLIC_METRICS_TOKEN` в публичном бандле, открытый `/api/metrics` |
| 11 | LOW | Swagger, CORS `* + credentials`, Redis fallback, ports, env frontend |

## Детали

### 1. HIGH — Dev-секреты при unset `NODE_ENV`
`backend/src/common/env.ts:1-23` возвращает `dev-only-insecure-secret-change-me` и `admin12345`, если `NODE_ENV !== 'production'`. `docker-compose.yml` не задаёт `NODE_ENV` по умолчанию. Достаточно забыть задать переменную — и JWT подписывается публично известным секретом, а сид-админ имеет пароль `admin12345`.

**Рекомендация:** требовать секреты всегда или явно разрешать dev-fallback только для `NODE_ENV=development|test`; задать `NODE_ENV=production` в Compose/K8s.

### 2. HIGH — Утечка пользователей всех арендаторов в конфиг ноды
`config-generator.service.ts:137-143` выбирает пользователей только по `status`/`expiresAt`, без `organizationId`. Для инбаунда без `userId` в конфиг попадают e-mail, UUID и `subscriptionToken` **всех** активных пользователей. Конфиг выдаётся по валидному node-токену (`nodes.service.ts:196-203`).

**Рекомендация:** фильтровать пользователей и правила по организации ноды.

### 3. HIGH — Агент наружу и дефолтный токен
`docker-compose.yml:67-68` маппирует `9090:9090`; `.env.example` содержит `AGENT_TOKEN=change-me-agent-token`. Неавторизован только `/health`; остальные эндпоинты (`/config`, `/restart-xray`, `/rollback`, `/logs`) защищены этим дефолтом.

**Рекомендация:** не публиковать порт, генерировать случайный секрет, mTLS, constant-time сравнение.

### 4. MEDIUM — USER читает чужой `subscriptionToken`
`users.controller.ts:70-73` не имеет `@Roles(...)`, `RolesGuard` пропускает. `users.service.ts:62-80` возвращает `subscriptionToken` и inbounds.

### 5. MEDIUM — OPERATOR меняет `organizationId`
`users.service.ts:99,127-131`, `nodes.service.ts:70,83-87` — значение из DTO принимается как есть. OPERATOR из орги A может создавать/перепривязывать ресурсы в орге B.

### 6. MEDIUM — Нет tenant isolation в Audit/Reports/Traffic/Payments
`audit.service.ts:34-49`, `reports.service.ts:24-107`, `traffic.service.ts:61-134`, `payments.service.ts:20-148`. OPERATOR видит чужие данные и может отметить чужой платёж оплаченным.

### 7. MEDIUM — SSRF через `agentUrl`
`agent-client.service.ts:11-49`, `nodes.controller.ts:130-145`. `agentUrl` — произвольная строка, панель делает HTTP-запрос и возвращает тело в `/api/nodes/:id/logs`. Канал по умолчанию plaintext, конфиг содержит subscriptionToken и `realityPrivateKey`.

### 8. MEDIUM — Не constant-time сравнения
`nodes.service.ts:108-114`, `agent/src/index.js:45-51`, `metrics.controller.ts:10`. В остальном проекте уже используется `timingSafeEqual` (alert webhook, Stripe).

### 9. MEDIUM — Токен подписки в URL
`subscriptions.controller.ts:8-55`, `sub/[token]/page.tsx`. Токен попадает в access-логи, историю браузера и `Referer`. Нет `Cache-Control: no-store`.

### 10. MEDIUM — Метрики
`settings/page.tsx:22` использует `NEXT_PUBLIC_METRICS_TOKEN` (попадает в клиентский бандл). `/api/metrics` открыт, если не задан `METRICS_TOKEN`.

### 11. LOW
Публичный Swagger, CORS `'*'` + `credentials`, Redis fallback умножает лимиты на число реплик, лишние порты в Compose, `.env` целиком попадает в контейнер frontend, download бэкапа не аудируется, HTML в Telegram-уведомлениях, YAML-инъекция через `inbound.tag`.

## Что реализовано корректно
- Stripe HMAC: raw body, `timingSafeEqual`, tolerance 300 с, несколько `v1`-подписей.
- Grafana alert webhook: `timingSafeEqual` + проверка длины.
- Backup API: строгий regex имени, `spawn` без shell, ADMIN-only, аудит, подтверждение restore.
- `execFile` без `shell: true` в агенте; нет `eval`/`child_process.exec`.
- Node-токены: `randomBytes(32)`, SHA-256 в БД, не выводятся в ответах.
- Argon2id с совместимостью bcrypt; fail-fast секретов в production.
- React-экранирование на странице подписки; helmet, whitelist validation, throttling.

## Приоритет исправления
1 → 2 → 3 (HIGH), затем 4–10 (MEDIUM), затем LOW. Связанные задачи заведены с меткой `security-audit`.
