# DNS-профили

Раздел **DNS-профили** (`/dns-profiles`) — визуальный редактор блока `dns` конфига Xray.
Доступен ADMIN и OPERATOR с tenant-изоляцией.

## Зачем

Раньше панель умела только список DNS-серверов (`["1.1.1.1","8.8.8.8","localhost"]`)
через routing profiles. Xray поддерживает гораздо больше: split DNS по доменам,
DoH/DoT/DoQ, `hosts`, `expectedIPs`, `skipFallback`, `serveStale`, параллельные запросы.
Это напрямую влияет на корректность geo-роутинга и утечки DNS.

## Поддерживаемые поля

Профиль состоит из трёх JSON-блоков:

- `hosts` — статические соответствия домен → IP;
- `servers` — массив строк (`"localhost"`, IP, `tcp://`, `https://`, `https+local://`, `tcp+local://`, `quic+local://`) или объектов Xray `DnsServerObject`;
- `options` — глобальные опции `dns`: `queryStrategy`, `disableCache`, `serveStale`,
  `serveExpiredTTL`, `disableFallback`, `disableFallbackIfMatch`, `enableParallelQuery`,
  `useSystemHosts`, `tag`.

Поддерживаемые ключи сервера: `address`, `port`, `domains`, `expectedIPs`, `unexpectedIPs`,
`skipFallback`, `finalQuery`, `tag`, `clientIP`, `queryStrategy`, `disableCache`, `timeoutMs`.

Не поддерживается `fakedns` — это отдельный сценарий с TUN/transparent proxy и своим риском
загрязнения DNS-кэша.

## Рецепты

- **DoH без утечек** — Cloudflare + Google DoH, `disableFallback: true`.
- **РФ-домены через локальный DNS** — `localhost` для `geosite:category-ru` с ожидаемым
  `geoip:ru`, остальные — через DoH.
- **Только локальный DNS** — минимальный профиль с `localhost`.

## Как применяется

Включённые профили сортируются по `priority` (по убыванию) и объединяются:
`hosts` — через spread, `servers` — с дедупликацией, `options` — через `Object.assign`.
Если хотя бы один профиль задал серверы, дефолтные `1.1.1.1/8.8.8.8/localhost` **не** добавляются.
Старые `dnsServers` из routing profiles добавляются в конец.

Проверка `POST /api/dns-profiles/validate` выполняется до сохранения; невалидный JSON
или неизвестное поле не попадут в конфиг.

## API

```text
GET    /api/dns-profiles
GET    /api/dns-profiles/:id
POST   /api/dns-profiles
PATCH  /api/dns-profiles/:id
DELETE /api/dns-profiles/:id
GET    /api/dns-profiles/recipes/list
POST   /api/dns-profiles/validate
```

## Ссылки

- https://xtls.github.io/en/config/dns.html
- https://xtls.github.io/en/config/fakedns.html
