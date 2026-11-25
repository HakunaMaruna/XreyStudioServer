# VLESS reverse / NAT-relay

Раздел **«Реле (NAT)»** (`/reverse`) реализует сценарий 1 из вердикта: нода без публичного
IP подключается к публичной ноде-порталу через VLESS reverse и становится доступной
через порт на портале.

Основа: `https://xtls.github.io/en/document/level-2/vless_reverse.html`.

## Как работает

- TARGET-нода (за NAT) получает в конфиге:
  - VLESS outbound с `reverse.tag = rev-<id>-in`, который сам подключается к выбранному
    VLESS inbound'у портала;
  - freedom outbound `rev-<id>-direct` с `redirect` на `internalAddress:internalPort`
    и `finalRules` — доступ разрешён только к этому адресу/порту;
  - routing rule `inboundTag: rev-<id>-in → rev-<id>-direct`.
- ПОРТАЛ-нода получает:
  - дополнительного VLESS-клиента с уникальным `reverse.tag = rev-<id>-out`
    в выбранном inbound'е;
  - dokodemo-door inbound на `publicPort`;
  - routing rule с этого inbound'а на `rev-<id>-out`.

Обычные пользовательские клиенты остаются в том же inbound'е; reverse-клиент имеет
отдельный UUID и не выдаётся в подписках.

## Настройка

1. Выберите целевую ноду (за NAT).
2. Выберите включённый VLESS inbound на публичной ноде-портале (REALITY или TLS).
3. Укажите публичный порт портала, внутренний адрес и порт сервиса на ноде.
4. Включите туннель и примените конфиг на обеих нодах.

## Безопасность

- Отдельный `bridgeUuid` на туннель, не смешивается с обычными UUID.
- На стороне ноды трафик из reverse-in уходит только в `finalRules` с явно разрешённым
  `internalAddress:internalPort`.
- Не используйте reverse-UUID как обычную подписку; при утечке отозвоните туннель.
- Публичный порт портала должен быть открыт в фаерволе только при необходимости.

## Ограничения MVP

- Поддерживается TCP+UDP dokodemo-door на портале и один внутренний сервис на ноде.
- Нет авто-создания TLS-сертификатов: используется безопасность выбранного VLESS inbound'а.
- Нет site-to-site L4/TUN, сохранения real IP через proxy protocol и N-to-N пулов.

## API

```text
GET    /api/reverse
POST   /api/reverse
PATCH  /api/reverse/:id
DELETE /api/reverse/:id
```
