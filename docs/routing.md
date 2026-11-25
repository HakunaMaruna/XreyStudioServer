# Профили маршрутизации (роутинг)

Профиль маршрутизации — это набор готовых настроек, который **реально попадает в конфиг Xray**:
добавляет правила в `routing.rules`, серверы в `dns.servers` и дополнительные `outbounds`.
В отличие от правил (`docs/rules.md`), профиль может менять DNS и создавать собственный outbound.

## Где создать

Панель → **Роутинг** → «Создать». Выберите рецепт в выпадающем списке — форма заполнится
проверенным payload'ом. Кнопка «Проверить» вызывает `POST /api/routing/validate` и показывает
ошибки до сохранения. Профиль нужно включить (toggle в таблице): в генератор попадают только
`enabled: true`.

## Рецепты

| id | Что делает |Payload |
|---|---|---|
| `local-dns-direct` | DNS (порт 53) мимо туннеля | `dnsServers` + правило `port: 53 → direct` |
| `ru-direct` | РФ-сайты напрямую | `geosite:category-ru`, `geoip:ru → direct` |
| `block-ads` | Блокировка рекламы | `geosite:category-ads-all → blocked` |
| `block-torrents` | Блокировка торрентов | `protocol: bittorrent → blocked` |
| `test-custom-outbound` | **Тестовый** профиль | `dnsServers: [9.9.9.9]`, outbound `xss-test-direct`, сеть `10.0.0.0/8` → этому outbound |

Все payload'ы рецептов проверены командой `xray run -test` с актуальными `geodata.dat`.
`test-custom-outbound` предназначен только для проверки генерации конфига и не рекомендуется
для продакшена.

## Валидация

`POST /api/routing/validate` принимает `{ "payload": {...} }` и возвращает:

```json
{ "valid": false, "errors": ["routingRules[0] has unknown outboundTag: nowhere"] }
```

Проверяются:
- структура payload и лимиты (до 16 DNS-серверов / 16 outbounds / 64 правил);
- уникальность outbound-тегов и запрет переопределять встроенные `direct`, `blocked`, `api`;
- существование `outboundTag` у каждого правила;
- наличие хотя бы одного матчера (`domain`, `ip`, `protocol`, `port`, …);
- типы полей.

Сохранение профиля с невалидным payload отклоняется на бэкенде — обойти проверку через UI
или напрямую через API нельзя.

## Как попадает в конфиг

`backend/src/modules/config/config-generator.service.ts` выбирает включённые профили
(глобальные или organizationId ноды) и добавляет их данные в конфиг:

```text
dns.servers = [...profileDns, '1.1.1.1', '8.8.8.8', 'localhost']
outbounds   = [direct, blocked, ...profileOutbounds]
routing.rules = [...rules из /api/rules, ...profileRules, catch-all direct]
```

Правило `api-in` для статистики добавляется в начало и не перекрывается профилем.

## Проверка на живой ноде

```bash
# 1. Создать и включить профиль из рецепта (UI или API)
curl -sS https://msc.h2onetwork.pro/api/routing/recipes/list -H "Authorization: Bearer $TOKEN" | jq -r '.[].id'

# 2. Применить конфиг
curl -sS -X POST https://msc.h2onetwork.pro/api/nodes/<node-id>/apply \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'

# 3. Убедиться, что данные профиля в конфиге
curl -sS https://msc.h2onetwork.pro/api/nodes/<node-id>/config \
  -H "Authorization: Bearer $AGENT_TOKEN" | jq '.config.routing.rules, .config.dns.servers, .config.outbounds'

# 4. Агент должен сообщить xray: running
curl -sS http://127.0.0.1:9090/health   # на ноде/в контейнере агента
```

Дополнительно конфиг можно проверить локально: `xray run -test -c config.json`.

## Изоляция

Оператор видит и меняет только профили своей организации; ADMIN — все.
Профиль с `organizationId: null` считается глобальным и применяется ко всем нодам.
