# PowerDNS в CONTROL-режиме

Панель работает в двух режимах: `PANEL_MODE=control` и `PANEL_MODE=tenant`.
`docker-compose.control.yml` выставляет `PANEL_MODE=control` для backend и поднимает
сервис `powerdns`. В TENANT-режиме DNS-сервер не устанавливается и раздел «DNS»
скрыт из меню.

## Раздел «DNS» (только CONTROL)

Доступен администратору по адресу `/dns`, пункт меню появляется только при
`PANEL_MODE=control`. Вкладки:

- **Обзор** — доступность PowerDNS, версия, число зон, запросы, uptime, задержка,
  подсказка по делегированию зоны.
- **Зоны** — список зон PowerDNS, создание (`POST /api/dns/zones`) и удаление.
  Зона `node.h2onetwork.pro` помечена `managed` — она используется для выдачи доменов нод.
- **Записи** — rrset'ы выбранной зоны в плоском виде; добавление и удаление записей.
- **Метрики** — значения `pdns_auth_*` из endpoint `/metrics` PowerDNS 4.4+.
- **Настройки** — API URL, API-ключ, зона нод, TTL, NS1/NS2, адрес привязки `:53`.

Все изменения проходят через бэкенд под JWT + роли ADMIN. API-ключ хранится
зашифрованно (`PANEL_MASTER_KEY`) и не возвращается в API — только признак наличия.
Свой API URL проверяется: в production только HTTPS, приватные адреса запрещены.

## API

```text
GET    /api/dns/status
GET    /api/dns/zones
POST   /api/dns/zones                 { name, ns1?, ns2? }
DELETE /api/dns/zones/:name
GET    /api/dns/zone/:zone/records
POST   /api/dns/zone/:zone/records    { name, type, ttl, records: [{ content }] }
DELETE /api/dns/zone/:zone/records?name=...&type=...
GET    /api/dns/settings
PATCH  /api/dns/settings              { PDNS_API_URL?, PDNS_API_KEY?, NODE_DNS_ZONE?, ... }
```

## Делегирование у регистратора

```text
node.h2onetwork.pro.   NS   ns1.h2onetwork.pro.
node.h2onetwork.pro.   NS   ns2.h2onetwork.pro.
ns1.h2onetwork.pro.    A    <IP CONTROL>
ns2.h2onetwork.pro.    A    <IP CONTROL>
```

Не добавляйте `*.node.h2onetwork.pro` в родительскую зону. На CONTROL-сервере
открыть UDP/TCP 53; `PDNS_BIND_IP=127.0.0.1` используется до делегирования,
затем заменяется на `0.0.0.0`.

## Что лучше: варианты и выбор

1. **Встроить PowerDNS-Admin** (отдельный контейнер) — готовый UI зон/записей,
   но второй frontend, своя авторизация и БД, дублирование RBAC. Отвергнуто.
2. **Отдельный микросервис DNS** — чистая граница, но лишний деплой и синхронизация
   токенов. Отвергнуто для MVP.
3. **Свой модуль поверх HTTP API PowerDNS** — выбран: один UI, один JWT/RBAC,
   уже есть модель доверия CONTROL/TENANT, сохраняются все текущие функции выдачи
   доменов через `/api/control/domains`. Как в PowerDNS-Admin, показываем зоны,
   записи и статистику, но без чужого кода и второй системы авторизации.

Ссылки: https://doc.powerdns.com/authoritative/http-api/index.html
