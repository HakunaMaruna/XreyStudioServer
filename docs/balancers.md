# Балансировщики

Раздел **Балансировщики** (`/balancers`) — визуальный редактор `routing.balancers` Xray.
Доступен ADMIN и OPERATOR; OPERATOR видит только балансировщики своей организации.

## Зачем

Xray умеет распределять трафик между несколькими outbound'ами. Настройка пишется в
`routing.balancers`, а трафик направляется туда правилом с `balancerTag`. По документации
Project X (`https://xtls.github.io/en/config/routing.html#balancerobject`):

```json
{
  "routing": {
    "balancers": [
      { "tag": "balancer", "selector": ["out"], "fallbackTag": "direct", "strategy": { "type": "roundRobin" } }
    ],
    "rules": [{ "inboundTag": ["in"], "balancerTag": "balancer" }]
  },
  "outbounds": [{ "tag": "out1" }, { "tag": "out2" }]
}
```

`selector` — **префикс** тегов участников. Для observatory (`leastPing`, `leastLoad`) нужен
корневой блок `observatory` с `subjectSelector`.

## Варианты, которые рассматривались

1. **Только JSON в routing profiles** — уже технически возможно (`outbounds[]` в профиле),
   но пользователь должен сам знать синтаксис Xray и расставлять теги. Отвергнуто.
2. **Выбор балансировщика на каждый inbound/пользователя** — гибко, но требует отдельного
   per-user routing и сильно усложняет MVP. Отложено.
3. **Отдельный интуитивный раздел** — выбран: форма со стратегией, участниками, правилом
   и предпросмотром сгенерированного фрагмента. Старые routing profiles и правила продолжают работать.

## Как настроить

1. **Балансировщики → Новый балансировщик**.
2. Укажите имя и стратегию:
   - `random` — случайный outbound;
   - `roundRobin` — по очереди;
   - `leastPing` — минимальная задержка (нужна проверка доступности);
   - `leastLoad` — наименьшая нагрузка (нужна проверка доступности).
3. Добавьте участников: протокол, адрес, порт и учётные данные. Пароли/UUID хранятся
   зашифрованно (`PANEL_MASTER_KEY`) и расшифровываются только при генерации конфига.
4. Заполните правило: домены, IP/CIDR, порт или network. Это станет routing rule с
   `balancerTag`. Если правило пустое, балансировщик создаётся «вручную» — его можно
   использовать из кастомных routing profiles по тегу `balancer-<id>`.
5. Включите балансировщик и нажмите «Применить» на странице ноды.
6. Кнопка «Предпросмотр конфига» показывает точный JSON, который уйдёт в Xray.

## Что генерируется

- outbound'ы участников с тегами `bal-<id>-out-<n>`;
- `routing.balancers` с `selector: ["bal-<id>-out-"]` и `fallbackTag`;
- `observatory` с `subjectSelector` всех включённых балансировщиков, общим `probeUrl`
  и интервалом первого балансировщика;
- routing rule с вашими matchers и `balancerTag`.

## API

```text
GET    /api/balancers
GET    /api/balancers/:id
POST   /api/balancers
PATCH  /api/balancers/:id
DELETE /api/balancers/:id
POST   /api/balancers/:id/preview
```

## Ограничения MVP

- Нет per-user и per-inbound выбора балансировщика.
- Нет весов участников и стратегии `leastLoad.settings` (только базовый `strategy.type`).
- У всех балансировщиков общий `observatory` (один probe URL и интервал — от первого включённого).
- sing-box и external-ноды (Hysteria2/TUIC/WireGuard) balancer не затрагивает.
- Участник с невалидными учётными данными не проверяется заранее — проверяйте конфиг
  через `xray run -test` / предпросмотр.
