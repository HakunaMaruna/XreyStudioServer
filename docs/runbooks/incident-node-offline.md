# Инцидент: нода офлайн или алерты не доставляются

## Симптомы

- На странице `/nodes` статус ноды `OFFLINE`, счётчик онлайн-нод меньше общего (`xss-node-offline`).
- Подписки клиентов не обновляются, `/api/nodes/:id/config` отвечает ошибкой.
- В Grafana срабатывает `xss-backend-down` / `xss-node-offline`, но в Telegram/Email/Webhook сообщений нет.
- В `/alerts` и `GET /api/notifications/alerts` нет новых записей.

## Проверки

```bash
cd /opt/XreyStudioServer
set -a; . ./.env; set +a
export PANEL_URL=http://127.0.0.1:3000
export NODE_ID=<uuid-ноды-из-UI>
export AGENT_URL=http://127.0.0.1:9090
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD='strong-admin-password'
export ADMIN_TOKEN=$(curl -sS -X POST "$PANEL_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')

curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$PANEL_URL/api/nodes/stats"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$PANEL_URL/api/nodes/$NODE_ID/health"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$PANEL_URL/api/nodes/$NODE_ID/logs?lines=200"
curl -fsS "$AGENT_URL/health"

curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$PANEL_URL/api/notifications/alerts?page=1&limit=20"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$PANEL_URL/api/notifications/channels"
```

## Команды

### 1. Локальный агент (Docker Compose)

```bash
docker compose ps agent
docker compose logs --tail=300 agent
curl -sS -o /dev/null -w '%{http_code}\n' "$AGENT_URL/health"
# Ручная отправка метрик с токеном ноды
export NODE_TOKEN=<токен-ноды-из-API-создания>
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$PANEL_URL/api/nodes/$NODE_ID/metrics" \
  -H "Authorization: Bearer $NODE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"cpu":1.5,"ram":20,"disk":35,"connections":10}'
```

### 2. Проверка доставки алерта

```bash
# 503 — нет ALERT_WEBHOOK_TOKEN; 401 — неверный токен; 201 — принято
curl -sS -o /tmp/xss-alert-response.json -w '%{http_code}\n' \
  -X POST "$PANEL_URL/api/notifications/alerts" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" \
  -d '{"status":"firing","title":"smoke test","alerts":[{"status":"firing","labels":{"alertname":"smoke test","severity":"warning"}}]}'
cat /tmp/xss-alert-response.json

curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$PANEL_URL/api/notifications/alerts?status=firing"

docker compose logs --tail=200 backend | grep -i 'notification\|alert\|smtp'
```

### 3. Kubernetes

```bash
export NAMESPACE=xss
kubectl -n "$NAMESPACE" get pods -l app=agent
kubectl -n "$NAMESPACE" logs -l app=agent --tail=200
kubectl -n "$NAMESPACE" get secret xss-secrets -o jsonpath='{.data.AGENT_TOKEN}' | base64 -d
kubectl -n "$NAMESPACE" port-forward svc/backend 3000:3000
kubectl -n "$NAMESPACE" port-forward svc/grafana 3002:3000
```

## Ожидаемый результат

- `/api/nodes/stats` показывает `online` >= 1, `/health` ноды содержит `online: true` и свежий `lastSeenAt`.
- Метрики-запрос с корректным токеном возвращает `201`, нода переходит в `ONLINE` в течение 60 секунд.
- Тестовый алерт возвращает `201`, появляется в `GET /api/notifications/alerts` и уходит в настроенные каналы.
- `GET /api/notifications/channels` показывает хотя бы один настроенный канал.

## Частые причины

| Причина | Проверка | Лечение |
|---|---|---|
| Агент не может достичь панели | `curl $PANEL_URL/api/health/live` с хоста агента | Исправить `PANEL_URL`, проверить DNS/ firewalls |
| Несовпадение `AGENT_TOKEN` | сравнить токен в `.env` ноды и секрете панели | Перевыпустить токен через `POST /api/nodes/:id/rotate-token` |
| Нода в другой организации | `GET /api/nodes/$NODE_ID` под admin | Проверить `organizationId` | 
| `ALERT_WEBHOOK_TOKEN` пуст | код `503` на тестовом алерте | Заполнить токен в `.env`/Secret, перезапустить backend и Grafana |
| SMTP/Signal/Webhook не настроены | `/api/notifications/channels` пуст | Заполнить переменные из `docs/monitoring.md` |
| Grafana не может попасть в backend | логи Grafana, `curl http://backend:3000/api/health/live` из пода | Исправить URL contact point и токен, перезапустить Grafana |

## Эскалация

- Если агент отвечает `/health`, но метрики не принимаются — приложить вывод `/api/nodes/:id/health` и логи backend с корреляционным временем.
- Если алерты сохраняются в `AlertHistory`, но не уходят в каналы — эскалировать с выводом `/api/notifications/channels` (без секретов) и логами `NotificationsService`.
- Подозрение на дефект приложения — завести отдельный issue с шагами воспроизведения и логами, не править исходники в рамках инцидента.
