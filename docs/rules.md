# Правила маршрутизации и готовые рецепты

Правило — это Xray routing rule (`type: field`), которая решает, куда отправлять соединение: `direct` (мимо туннеля) или `blocked` (blackhole). Правила применяются ко всем нодам организации и попадают в сгенерированный конфиг вместе с базовыми outbounds.

## Создание правила

1. **Инфраструктура → Правила → Новое правило**.
2. Выберите **«Готовый рецепт»** — он подставит `type`, JSON-правило и описание.
3. При желании поправьте JSON вручную и нажмите **«Проверить»** — бэкенд проверит структуру и разрешённые `outboundTag`.
4. Сохраните. Нажмите **«Применить»** на ноде, чтобы получить новый конфиг.

## Готовые рецепты

| Рецепт | Условие | Действие |
| --- | --- | --- |
| Блокировать рекламу | `geosite:category-ads-all` | `blocked` |
| Российские сайты напрямую | `geosite:category-ru`, `geoip:ru` | `direct` |
| Китайские сайты напрямую | `geosite:cn`, `geoip:cn` | `direct` |
| Локальные сети напрямую | RFC1918 + loopback CIDR | `direct` |
| Блокировать 18+ | `geosite:category-porn` | `blocked` |
| Блокировать торренты | `protocol: bittorrent` | `blocked` |
| DNS-запросы напрямую | `port: 53` | `direct` |

Geo-рецепты требуют `geosite.dat`/`geoip.dat` на ноде — они кладутся в образ агента рядом с бинарником Xray (`XRAY_LOCATION_ASSET`). Рецепт «Локальные сети» работает без геодаты.

Идеи подсмотрены в `Mistgate/mistgate` (split DNS, country lists) и `remnawave/backend` (geo-роутинг), оба AGPL-3.0. Payload-шаблоны написаны заново под наш генератор.

## Проверка правила

`POST /api/rules/validate` принимает `{ "payload": {...} }` и возвращает:

```json
{ "valid": true, "errors": [] }
```

Проверяются:
- payload — объект, не массив;
- обязательный `type`;
- `outboundTag` — только `direct` или `blocked`;
- `domain`/`ip`/`protocol`/`port` — строка или массив строк;
- наличие хотя бы одного совпадения (matcher).

Правило с ошибкой не сохраняется через API.

## Как убедиться, что правило работает

Создание правила ещё не означает, что оно применяется — нужно применить конфиг на ноде:

1. Создайте правило.
2. **Ноды → ваша нода → Применить** (создаёт новую ревизию и отправляет конфиг агенту).
3. Проверьте статус агента: `xray: running`, версия конфига выросла.
4. Откройте `/api/nodes/:id/config` (или ревизию в UI) и убедитесь, что правило появилось в `routing.rules`.

Живой пример: правило «Блокировать торренты» добавляет в конфиг:

```json
{ "type": "field", "protocol": ["bittorrent"], "outboundTag": "blocked" }
```

Трафик, определённый как bittorrent, уходит в `blackhole` — это можно проверить, скачав торрент через подключение (скорость будет нулевой).

## API

```bash
TOKEN=$(curl -sS -X POST https://msc.h2onetwork.pro/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}' | jq -r .accessToken)

curl -sS https://msc.h2onetwork.pro/api/rules/recipes/list -H "Authorization: Bearer $TOKEN"

curl -sS -X POST https://msc.h2onetwork.pro/api/rules/validate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"payload":{"type":"field","domain":["geosite:category-ads-all"],"outboundTag":"blocked"}}'
```
