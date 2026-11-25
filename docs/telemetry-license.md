# Лицензионное соглашение на отправку статистики XreyStudioServer

Версия 1.0, 26 ноября 2026 г.

Нажимая «Разрешить отправку», вы соглашаетесь с настоящим соглашением.
Панель является самоустанавливаемым программным обеспечением: разработчик не имеет
доступа к вашим серверам. Отправка статистики — **добровольная** и может быть отключена
в любой момент в разделе «Статистика» (`/telemetry`).

## 1. Что отправляется

Один раз в 6 часов (и вручную по кнопке «Отправить сейчас») на главный сервер
отправляются только агрегированные счётчики:

- количество пользователей, нод, подключений (inbounds, включённые inbounds);
- количество правил, хостов, профилей маршрутизации, организаций;
- количество тарифных планов, платежей, балансировщиков, DNS-профилей;
- количество установленных плагинов и снимков системы;
- версия панели, режим (`control`/`tenant`), случайный `installId` (UUID);
- счётчики событий за 24 часа из безопасного списка: `node.error`, `node.offline`,
  `config.apply.failed`, `backup.failed`, `plugin.quarantine`, `health.check.failed`,
  `snapshot.failed`.

## 2. Что НЕ отправляется

- IP-адреса, email, имена и任何其他 персональные данные пользователей;
- конфигурации Xray, ключи, пароли, токены, секреты;
- трафик, статистика по доменам и подписчикам;
- содержимое логов, содержащее произвольный текст;
- данные о местоположении и вышестоящем провайдере.

## 3. Хранение и использование

Главный сервер хранит `installId`, режим, версию, время последней активности,
агрегированные снимки и обезличенные события. Данные используются только для
понимания того, как панель эксплуатируется, и приоритизации работ.
Сторонним рекламным и аналитическим сервисам данные не передаются.

## 4. Отказ

Отказ от отправки не ограничивает функциональность панели. Вы можете в любой момент
установить `enabled = false` в разделе «Статистика» или unset `TELEMETRY_URL` в `.env`.
Уже отправленные агрегированные данные могут быть удалены администратором главного сервера
по запросу на `installId`.

## 5. Изменения

Изменения соглашения публикуются в этом файле в репозитории. Продолжение отправки
после обновления означает принятие новой редакции.

---

# License agreement for telemetry (English)

By clicking "Allow sending" you agree to this agreement. The panel is self-hosted:
the developer has no access to your servers. Telemetry is **optional** and can be
disabled at any time in `/telemetry`.

Only aggregated counters (users, nodes, inbounds, rules, hosts, routing profiles,
organizations, plans, payments, balancers, DNS profiles, plugins, snapshots), panel
version, mode, a random installation UUID and a small allowlisted set of error-event
counts are sent every 6 hours.

No IP addresses, emails, personal data, Xray configs, keys, passwords, tokens,
traffic, domain data, subscriber data or arbitrary log text are sent.

The main server stores the installation ID, mode, version, last-seen time, aggregated
snapshots and anonymized events, and uses them only to prioritize development.
Declining does not restrict panel functionality.
