# HANDOFF — XreyStudioServer (XSS)

Context for the next agent. Read this first, then `trail ask "<question>" /work/XreyStudioServer`
or `trail skeleton <file> /work/XreyStudioServer` (code map already built in `graft/`).

> **Для следующих код-агентов (2026-11-24):** работа по v2.23.3 и AdminLTE завершена и запушена.
> main — последний коммит в этом репозитории (см. `git log -1`), тег/релиз `v2.23.3` опубликован, CI/Images/Live API smoke зелёные.
> Event-level notification routing (PR #165, `59a8e5e`) доделан; AdminLTE — дефолтный UI
> (PR #164), все 21 страница и общие компоненты покрыты, awful Aurora оставлен намеренно
> (`NEXT_PUBLIC_UI=aurora`). Документация обновлена, подписи переключателя локализованы.
> Локальные ограничения: Turbopack `next build` падает только на Node 20.15 (ESM
> `magic-string`) — используйте `npx next build --webpack`; v15 pg e2e пропущен из-за
> pg_dump 16 vs PGlite 19 (в CI проходит). `/work` чистый; proot блокирует запись объектов
> git — синхронизируйте копированием loose objects из `/tmp/opencode/xss-work-225`.

## Final UX branch status (2026-11-26, PR #208 merged)

PR #208 (`ux/panel-2026-11-26`) влит в `main` как `7a77ea7`; CI зелёный (backend, frontend,
docker, e2e-postgres, smoke). Во время работы `main` ушёл вперёд до v2.42.1 (`d917959`),
поэтому ветка была перебазирована на него. PG-спект `xray-stats-and-protocols.e2e-pg-spec.ts`
потребовал трёх правок: аргументы `ConfigGeneratorService` (balancers + dnsProfiles), mock
`reverseTunnel.findMany` и удаление ожидания `streamSettings.flow` (с v2.42.0 flow остаётся
только в `settings`). Локально после rebase: FE/BE tsc 0, eslint 0 errors, backend jest
42 suites / 215 tests, PG-спект 6/6, `next build --webpack` rc=0. Prod не трогался.
`/work/XreyStudioServer` синхронизирован: HEAD `4ef85f8`, origin/main `7a77ea7`,
`core.filemode=false`, untracked-файлы сохранены.

## Handoff continuation (2026-11-26, v2.41.0)

Активный `/work/XreyStudioServer` был рассинхронизирован с рабочим каталогом другого
агента (`/tmp/opencode/xss-work-fresh`, clean at `fff8ed4`): 47 файлов отставали, версии
были 2.40.9. Синхронизация завершена — теперь `/work` совпадает с `fff8ed4` целиком.
Поверх сохранены правки страницы нод: подписанная красная кнопка удаления с `confirm()`,
автообновление списка/метрик/пинга раз в 15 с с меткой «Обновлено», пинг над CPU/RAM с
красным статусом для недоступной ноды. i18n-ключи (`deleteNode`, `nodeDeleteConfirm`,
`lastUpdated`) перебазированы на актуальный словарь v2.41.0.

Доделано по ошибкам, которые остались после предыдущего агента:
- `prisma generate` — сгенерирован клиент с `TelemetrySetting.declined` (без этого tsc падал).
- ESLint errors → 0: `Date.now()` в рендере подписки заменён на `now`-state с тиком раз в
  1 с; в мастере fallback `Date.now()` заменён на «—»; async Promise executor в
  `AgentClientService.request` обёрнут в async IIFE с `.catch(reject)`; убраны
  бесполезная инициализация `valid` и `let rows` → `const rows`.

Проверено: frontend `tsc --noEmit` 0, `eslint` 0 errors, `next build --webpack` rc=0;
backend `tsc --noEmit` 0, `eslint` 0 errors, `nest build` rc=0, unit jest 42 suites /
210 tests зелёные. pg e2e по-прежнему пропущен локально (pg_dump 16 vs PGlite 19).

### Push status (2026-11-26)

Правки запушены в GitHub веткой `ux/panel-2026-11-26` (5 atomic-коммитов, rebase на
`origin/main` v2.41.4, конфликтов не было). Резервные refs на `fff8ed4` (v2.41.0):
ветка `backup/2026-11-26` и тег `backup-2026-11-26`. В `main` ничего не влито, PR не
открывался, prod не трогался. После rebase повторно проверено: FE/BE `tsc` 0,
`eslint` 0 errors, `next build --webpack` rc=0, `nest build` rc=0, jest 42 suites /
213 tests. `/work/XreyStudioServer` синхронизирован полностью: рабочее дерево и `.git`
находятся на `ux/panel-2026-11-26` (`core.filemode=false` из-за прав proot), `git fsck
--connectivity-only` чистый. Старый `.git` (с локальным коммитом `501ad7a`) сохранён в
`/tmp/opencode/xss-work-git-backup-2026-11-26`. Неотслеживаемые локальные файлы
(`api.md`, `hosts.md`, `node-onboarding.md`, `frontend/public/vendor/` и др.) оставлены
на месте.

## Postponed: plugin system + store + cloud account (2026-11-25)

Задача отложена пользователем до дополнительных уточнений. Реализация не начиналась.
Возобновить после реализации основного функционала панели (по указанию пользователя).
Исследование, план из 15 задач и уточнённые требования (задачи 7–15) зафиксированы
в переписке. Перед возобновлением нужно получить ответы на 4 вопроса:
1) где исполняются плагины (рекомендуется изолированный серверный worker);
2) хостинг-провайдер и песочница (или локальный mock);
3) платёжный провайдер и валюта (по умолчанию Stripe + USD minor units);
4) облако — отдельный сервис или модуль внутри панели.

Ключевые ограничения, уже данные пользователем: только админ-одобренные пакеты,
встроенный/self-hosted реестр, без загрузки по URL из manifest, подпись отложена
(описать фактическую модель доверия), без изменения основной схемы БД плагинами,
запрет замены той же версии, повторное согласие при новых permissions, сохранение
возможности отката пакета, без обещания автоматического отката данных, двойная
запись ledger, сага покупки нод, серверная проверка entitlements.

## Subscription 404 and node cleanup (v2.42.5, 2026-11-26)

- `frontend/src/middleware.ts`: реврайт `/sub/<token>` для не-браузерных UA теперь даёт
  `/api/subscriptions/<token>` вместо `/api/subscriptions/sub/<token>` (404 у Incy и всех
  VPN-клиентов). Добавлен `npm run test:sub-rewrite`.
- Удаление ноды теперь каскадно удаляет inbounds (`onDelete: Cascade`) и в одной транзакции
  чистит install-задачи, wizard-креды, домены и развязывает UserTraffic. Добавлен
  `DELETE /api/nodes/orphan-inbounds` для уже существующих "висячих" подключений.
- ТЕЛЕМЕТРИЯ:-normalization `TELEMETRY_URL` больше не дублирует `/api`.

## Persistent ACME state (v2.42.4, 2026-11-26)

`/etc/letsencrypt` в backend теперь volumes (`letsencrypt`) и не теряется при пересоздании
контейнера — иначе выданные сертификаты доменов нод исчезали после деплоя.

## Node setup speed and agent reachability (v2.42.3, 2026-11-26)

Замер установки: ~5м54с, из них ~5м18с — подготовка (git clone + установка Docker через
get.docker.com/apt), ~20с — сборка образа агента, ~16с — выпуск сертификата. Добавлен
`9090:9090/tcp` в `docker-compose.node.yml` (без него панель не могла достучаться до агента
для установки сертификата заглушки). Мастер теперь ждёт готовность агента (до 60с) перед
установкой сертификата.

## Agent certificate payload fix (v2.42.2, 2026-11-26)

PR #209: эндпоинты агента `/certificate` и `/decoy-certificate` теперь понимают форму
`{ payload: {...} }`, которую шлёт панель (ранее сертификат не устанавливался). Исправлена
потеря трафика при неудачном репорте и добавлено логирование register/pullConfig.

## Node port mapping fix (v2.42.1, 2026-11-26)

В `docker-compose.node.yml` добавлен проброс `443:443/tcp` — без него Reality-инбаунд
слушал внутри контейнера, но был недоступен клиенту снаружи.

## Default Reality inbound + decoy site (v2.42.0, 2026-11-26)

Мастер теперь создаёт для новой ноды VLESS + Reality + xtls-rprx-vision на порту 443.
Reality dest — локальный TLS-сайт `127.0.0.1:8443`, serverNames/shortIds/ключи X25519
уникальны для ноды, fingerprint=chrome. Перед установкой проверяется A-запись домена
(`NODE_DNS_RESOLVERS`); при отсутствии домена — явная ошибка или fallback по
`WIZARD_REALITY_FALLBACK=true` с предупреждением в лог. CONTROL выпускает сертификат,
мастер передаёт его агенту через `/decoy-certificate`; агент поднимает HTTPS-заглушку
только на loopback:8443 и HTTP-01/webroot на :80 с автопродлением. Шаблон заглушки —
`agent/assets/decoy.html`. Старые ноды и TLS-inbound'ы не изменены.

## UX branch sync (v2.41.5, 2026-11-26)

Влита ветка второго агента `ux/panel-2026-11-26` (6 коммитов): node delete confirmation,
live polling/ping states, async IIFE в agent-client, фикс hydration Date.now() в сабскрипшене
и мастере, упрощение signature/vpn app query. Дополнительно исправлен баг в их правке:
`const rows` + `rows.push()` ломал первичный seeding приложений — возвращается mutable копия.

## Agent fixes (v2.41.4, 2026-11-26)

Найдена причина гибели агента после выпуска TLS-сертификата: исходный HTTP-сервер
не регистрировался в `activeServer`, поэтому `/certificate` поднимал HTTPS на том же порту
и получал `EADDRINUSE` — процесс падал. Теперь стартовый сервер создаётся через
`startServer()`, ошибки listen логируются, добавлен обработчик `spawn error` Xray и
ограничение числа бэкапов конфига (10).

## Stale node status (v2.41.3, 2026-11-26)

Панель показывала `ONLINE` по БД-статусу даже после того, как агент перестал слать
метрики. Теперь статус в API/UI вычисляется по времени последнего heartbeat
(`NODE_OFFLINE_AFTER_MS`, по умолчанию 120 с), и dashboard-счётчик считает только
свежие ONLINE-ноды.

## Follow-up hardening (v2.41.2, 2026-11-26)

- PR #207 (UI audit: z-index, modal portal/scroll, safe-area, touch targets) влит в main.
- Настройки плагина больше не передаются в env воркера — они приходят в IPC `invoke`
  вместе с `payload`; убрано противоречие с «no env access».
- Неудачное обновление плагина теперь откатывает артефакты, SQL-миграции (down/up)
  и метаданные БД к предыдущей версии, затем переводит плагин в QUARANTINED.

## Code review / security fixes (v2.41.0, 2026-11-26)

Проведена ревизия тремя параллельными проверками. Исправлено:
- SSRF в AgentClient: приватные/IPv4-mapped адреса, query/fragment в agentUrl, DNS-rebinding
  (пинг адреса через lookup), валидация CreateNodeDto.address/agentUrl.
- Snapshot restore больше не снимает блокировку `busy` при внутреннем pre-restore снимке.
- Телеметрия: строгая проверка ingest-тела, отказ «decline» больше не принимает лицензию
  (`TelemetrySetting.declined`), в БД пишется только whitelist полей.
- Мастер: OPERATOR может создавать ноду, порт SSH единообразно 22, безопасная обработка
  коллизии `installId`, живой polling использует серверный id.
- Плагины: повторная проверка отзыва и master-политики при enable/call/install/download,
  исправлена нормализация PEM, SSRF-фильтр с DNS и IPv4-mapped, rollback SQL при неудачной
  установке, проверка совместимости версий панели, UI uninstall через DELETE.
- Обновления: безопасные URL релизов (XSS), валидация UPDATER_URL/UPDATE_REPO,
  channel-scoped cache, выбор максимальной semver в dev-канале, строгий normalizeVersion,
  413 вместо обрыва соединения, `make update` понимает CONTROL compose, токен updater
  создаётся и для существующих `.env`, control-панель не опрашивает несуществующий updater.
- Ядро: изоляция api-токенов для OPERATOR без организации, проверка tenant-владения ноды
  при bind, безопасная компиляция ACME shell-хуков, timingSafeEqual для токена ноды,
  санитизация stderr pg_dump/psql, скрытие вывода updateAgent, MONITOR-токен с организацией
  больше не видит глобальный счётчик алертов.

Осталось как осознанные ограничения: docker.sock в updater даёт host-root (только profile
`updater`), settings плагина передаются в env воркера, автоматический rollback при провале
обновления плагина всё ещё делается вручную из snapshot.

## Snapshot auto-before-update fix (v2.40.9, 2026-11-26)

Политика `autoBeforeUpdates` была реализована, но ни один рабочий эндпоинт её не
использовал. Добавлен `@SnapshotBefore('update')` на `POST /api/updates/apply` (реальное обновление
панели из нового update-модуля), `POST /api/nodes/:id/apply` и
`POST /api/nodes/:id/rollback/:revisionId`; это также покрывает `scripts/rollout.sh`.

## Wizard domain choice (v2.40.7, 2026-11-26)

Шаг 2 мастера: переключатель «Автоматический домен» (по умолчанию) / «Свой домен»
вместо поля «Свой домен (необязательно)». Явно указано, что поддомен создаётся
автоматически и сертификат для него выпускает панель. Для своего домена добавлен
чекбокс «Выпустить сертификат» (по умолчанию да) и подсказка про CNAME. Если сертификат
не выбран — CNAME не требуется, свой домен сохраняется как информация, TLS/SNI
остаётся на автоматическом домене (`issueCustomCert=false`).

## Root cause of ACME failure (2026-11-26)

Делегирование `node.h2onetwork.pro` у регистратора уже было корректным (ns1/ns2 →
213.171.30.186). Проблема была в `PDNS_BIND_IP=127.0.0.1`: PowerDNS слушал только
localhost, поэтому Lets Encrypt не мог прочитать TXT `_acme-challenge.*`. Выставлено
`PDNS_BIND_IP=213.171.30.186`, 53/tcp+udp открыт на публичном IP; повторный retry
выпустил сертификат для `61ffb425b3fb.node.h2onetwork.pro` успешно.

## Certificate and agent URL fixes (v2.40.6, 2026-11-26)

- Ошибка 500 при выпуске сертификата заменена на 503 с подробностью ACME и подсказкой
  о делегировании зоны `node.h2onetwork.pro` на CONTROL.
- Мастер создаёт ноды с `agentUrl=http://host:9090`; добавлен флаг
  `ALLOW_HTTP_AGENT_URLS` (в CONTROL по умолчанию true), снимающий только требование HTTPS.
  Приватные/link-local адреса по-прежнему запрещены.

## Wizard install prompt fix (v2.40.6, 2026-11-26)

`ask()/confirm()` в install.sh печатали приглашения в stdout, из-за чего `DOMAIN` и
`PANEL_URL` получали текст приглашения и нода-установка застревала на проверке DNS.
Приглашения перенаправлены в stderr, DNS пропускается для localhost. Мастер теперь
явно передаёт `PANEL_URL` и `--domain localhost` при вызове install.sh.

## Wizard node install hang fix (v2.40.5, 2026-11-26)

Причина зависания на `install.sh --mode node`: штатный `docker-compose.yml` поднимает
агент с `depends_on: backend`, поэтому на ноде собиралась и запускалась вся панель. Добавлен
`docker-compose.node.yml` только с агентом, install.sh использует его. Вывод удалённых
команд теперь стримится в терминал окна установки (с фильтрацией секретов), сообщение
о таймауте указывает этап.

## Wizard install progress (v2.40.4, 2026-11-26)

При создании ноды открывается модальное окно с прогресс-баром и мини-терминалом.
Шаги и вывод удалённых команд пишутся в `NodeInstallJob`/`NodeInstallLog` и опрашиваются
через `GET /api/wizard/install/:installId`. Таймаут удалённой команды увеличен с 180 с
до 600 с (`NODE_PROVISION_COMMAND_TIMEOUT_MS`). Обратная миграция:
`backend/prisma/node-install-down.sql`.

## Wizard SSH provisioning flag (v2.40.3, 2026-11-26)

`SSH_PROVISION_ENABLED` по умолчанию включается в `docker-compose.control.yml`; на живой
панели добавлено в `.env`. Без флага мастер выдавал «SSH provisioning is disabled».

## Wizard fixes (v2.40.2, 2026-11-26)

В мастере создания ноды в режиме «логин и пароль» поле отпечатка SSH-ключа скрыто и не
отправляется; бэкенд требует отпечаток только для key/password_key. Удалено дублирующее
поле поиска «Локация» — оставлен один выпадающий список стран.

## Deferred telemetry follow-ups (2026-11-26)

Позже: UI токенов ingest, retention/автоудаление старых отчётов, графики и алерты,
расширенные логи по отдельному согласию с redaction, тонкая категоризация метрик.

## Installation statistics / telemetry (v2.40.0, 2026-11-26)

Добровольная статистика установок. При первом входе показывается модальное окно со ссылкой
на `docs/telemetry-license.md` и выбором «разрешить/не отправлять». Отправляются только
агрегированные счётчики (пользователи, ноды, подключения, правила, плагины и т.д.) и
обезличенные счётчики ошибок раз в 6 часов. Главный сервер принимает отчёты по API-токену
со scope `TELEMETRY`, хранит установки/снимки/события в `Telemetry*` таблицах.
Сводка: `/telemetry`, `GET /api/telemetry/installations`, `GET /api/telemetry/logs`.
Настройки: `TELEMETRY_URL`, `TELEMETRY_TOKEN`, `TELEMETRY_INTERVAL_MS`.
Обратная миграция: `backend/prisma/telemetry-down.sql`.

Живая проверка v2.40.1: `/api/telemetry/status` и `preview` работают, ingest по токену со scope
`TELEMETRY` принял тестовый отчёт, список установок и журнал событий отображаются, без токена
→ 401, UI `/telemetry` → 200. Модальное окно согласия показывается только ADMIN/OPERATOR.
Токен ingest создан через API (имя `telemetry-ingest`), в репозиторий не сохранён.

## Deferred plugin follow-ups (2026-11-26)

Список работ по плагинам, которые не вошли в MVP: контейнер/WASM-изоляция для сторонних
плагинов, реальный рендер UI-слотов, trial-period auto-rollback, real store AuthProvider,
платные плагины, проактивная рассылка отзывов. Дубликат в issue (создаётся отдельно).

## Plugin system and App Store (v2.39.0, 2026-11-25)

ADR and spec: `docs/plugins/ADR.md`, `docs/plugins/PLUGIN_SPEC.md`, `docs/plugins/README.md`.
Master is the policy source, tenant receives catalog through master proxy. Store is a separate
container/DB with moderation statuses and revocation list. Plugin runtime is a limited worker
process with permission-checked SDK; third-party packages require moderation and Ed25519 signature.
UI: `/plugins` (installed/catalog/policy), store catalog and moderation pages.
Snapshot before any plugin change; safe mode via `PLUGIN_SAFE_MODE=true`, kill switch via
`PLUGINS_DISABLED=true`. CLI: `scripts/plugin-cli.mjs`. Down migration: `backend/prisma/plugin-down.sql`.

Живая проверка v2.39.3: store контейнер и store-db подняты, каталог/модерация отвечают,
неавторизованная публикация → 401. Подписанный `hello-widget` опубликован в store, виден
через master `/api/plugins/catalog`, скачан и установлен; `enable` → `ENABLED`, `health` → healthy.
Неподписанный пакет отклонён. `audit-hook` с миграцией установлен (таблица создана) и удалён
(таблица удалена). Демо `hello-widget` оставлен включённым; React-виджет на дашборде пока не рендерится — слоты возвращают данные бэкенда. Отзыв плагина теперь проверяется и на сервере: прямой download в store → 403, через master → 403 (v2.39.6).

## Subscription page (v2.38.0, 2026-11-25)

Публичная страница `/sub/[token]` переработана: mobile-first, светлая/тёмная тема с
автоопределением, RU/EN переключатель, карточка с обратным отсчётом и оставшимся трафиком,
QR/копирование, приложения с определением ОС и deep links, состояния подписки.
Добавлены `SubscriptionPageSettings`, `VpnApp`, админ-раздел `/subscription-page` с
предпросмотром `/sub/preview`, санитайзер CSS и валидация deep link. Старые форматы
подписки и HWID-binding не тронуты. Документация `docs/subscription-page.md`.

Живая проверка v2.38.0: `/api/subscription-page/settings` и `/apps` работают, дефолтно
засеяно 11 приложений (Happ, v2rayNG, Streisand, Hiddify, Clash Meta, FlClash, Clash Verge,
sing-box, NekoBox, V2Box, Shadowrocket); невалидный accent → HTTP 400; `/api/subscriptions/preview`
и реальный JSON-подписки возвращают `page.settings`/`page.apps`; `/sub/preview` и `/sub/<token>`
отдают страницу с браузерным UA (curl без UA корректно редиректится на машинную подписку
через middleware). Проверка на 390px выполнена по CSS-разметке (headless browser недоступен).

## NAT relay (v2.37.0, 2026-11-25)

Сценарий 1 из вердикта: VLESS reverse-туннель для ноды за NAT. Раздел `/reverse`:
целевая нода, VLESS inbound на публичной ноде-портале, публичный порт, внутренний адрес/порт.
Генератор добавляет на ноду reverse-bridge outbound + freedom с finalRules, на портал —
дополнительного VLESS-клиента с отдельным UUID и dokodemo-door inbound. Обычные подписки
не затрагиваются. Документация `docs/reverse.md`, `docs/api.md`. Тесты 34 suites / 175 tests.

Живая проверка v2.37.1: создан временный узел `nat-dummy` и туннель к VLESS REALITY inbound
`test-reality-2054`. Конфиг портала содержит `rev-<id>-portal` inbound и правило на
`rev-<id>-out`; конфиг целевого узла — `rev-<id>-bridge`/`rev-<id>-direct` и правило
`rev-<id>-in → direct`. Оба `xray run -test` — `Configuration OK`. Туннель и временный узел
удалены, агент `xray: running`. Исправление v2.37.1: client-side REALITY (`password`,
`serverName`, `shortId`, `fingerprint`) вместо server-side полей.

## Burst Observatory (v2.36.0, 2026-11-25)

В балансировщике добавлен выбор `observatoryMode`: `observatory` или `burstObservatory`
с настройками destination/interval/sampling/timeout. Если включён burst, генератор пишет
только `burstObservatory` с объединённым subjectSelector. Документация `docs/balancers.md`.

Живая проверка v2.36.0: балансировщик `burstObservatory` + `leastPing` применён, конфиг
содержит `burstObservatory.pingConfig` (60s/10/5s/HEAD), обычного `observatory` нет;
`xray run -test` — `Configuration OK`. Тестовый балансировщик удалён, конфиг применён
повторно, агент `xray: running` (revision 28).

## DNS profiles (v2.35.0, 2026-11-25)

Новый раздел `/dns-profiles`: визуальный редактор Xray `dns` — hosts, серверы
(UDP/DoH/DoT/DoQ/local modes) с domains/expectedIPs/skipFallback, глобальные опции.
Три рецепта, валидация до сохранения, tenant-изоляция; включённые профили объединяются
по приоритету в генераторе конфига. `fakedns` намеренно не поддерживается.
Документация `docs/dns-profiles.md`, `docs/api.md`.

Живая проверка: v2.35.0, рецепты `secure-doh/ru-split/local-direct`; валидация отклонила
`ftp://bad`; созданный профиль с hosts + localhost(geosite:category-ru) + DoH попал в
сгенерированный `dns` блок, `xray run -test` на выгруженном конфиге — `Configuration OK`;
профиль удалён, конфиг применён повторно, агент `xray: running` (revision 26).

## Load balancers (v2.34.0, 2026-11-25)

Новый раздел `/balancers`: форма создания балансировщика (стратегия random/roundRobin/
leastPing/leastLoad, участники с зашифрованными учётными данными, правило domain/ip/port/network,
fallback, probe URL/interval) и предпросмотр сгенерированного Xray-фрагмента.
Генератор добавляет outbound'ы `bal-<id>-out-<n>`, `routing.balancers`, rule с `balancerTag`
и root `observatory`. Выбран вариант отдельного раздела вместо raw JSON в routing profiles
или per-user балансировки (отложена). Документация `docs/balancers.md`, `docs/api.md`.

Живая проверка v2.34.1: balancer создан через API (2 freedom-участника, правило
`example.test`), preview вернул `routing.balancers`, selector `bal-<id>-out-`,
observatory и rule с `balancerTag`; конфиг применён (revision 19/22), агент
`xray: running`, локальный `xray run -test` на выгруженном конфиге — `Configuration OK`.
Тестовый балансировщик удалён, конфиг применён повторно, балансировщиков осталось 0.

## DNS section (v2.33.0, 2026-11-25)

CONTROL/TENANT выявлены через `PANEL_MODE` (control-compose выставляет `control`).
Новый пункт меню «DNS» показывается только в CONTROL. Раздел `/dns`: обзор зон/запросов/
uptime, управление зонами и записями через HTTP API PowerDNS, метрики `pdns_auth_*`,
настройки (API URL/ключ, зона, TTL, NS1/NS2, bind IP). API-ключ шифруется, не отдаётся.
Выбран вариант «свой модуль поверх API PowerDNS» вместо отдельного PowerDNS-Admin
или микросервиса: единый JWT/RBAC и сохранение выдачи доменов через `/api/control/domains`.
Документация `docs/powerdns.md`, `docs/api.md`. Тесты 29 suites / 156 tests.

Живая проверка: v2.33.0, `PANEL_MODE=control` из compose, `/api/dns/status` →
mode control, available true, PowerDNS 4.4.1, 1 зона, 2 запроса, uptime 47565,
метрики `pdns_auth_*`; `/api/dns/settings` отдаёт зону/TTL/NS/bind IP и флаг ключа,
но не сам ключ; PATCH TTL 90 → 60 применён; зона `node.h2onetwork.pro.` помечена
managed, 3 rrset'а. Пункт меню DNS добавляется на клиенте после проверки режима.

DNSSEC (v2.33.1): вкладка DNSSEC — включение/выключение подписи зоны, создание
KSK/ZSK/CSK, активация/публикация и удаление ключей, вывод DS-записей для регистратора.
Приватный ключ не возвращается. Тесты 29 suites / 158 tests.

Фиксы v2.33.2–v2.33.5: PowerDNS 4.4.1 требует `rrsets: []` в PATCH зоны даже при
изменении только `dnssec` (без этого 422), а daemon-wide DNSSEC для gsqlite3 задаётся
`--gsqlite3-dnssec=yes` (не `--dnssec`, не `dnssec=` в pdns.conf — оба давали
«unknown parameter»). Живой тест на v2.33.5: временная зона
`dnssec-test.h2onetwork.pro.` создана, DNSSEC включён (HTTP 200), ключ создан
(HTTP 201, ECDSAP256SHA256 256 bit, 3 DS-записи, `privatekey` в ответе отсутствует);
ключ и зона удалены после проверки. Рабочая зона `node.h2onetwork.pro.` не менялась.

## Nodes grid (v2.32.3, 2026-11-25)

Таблица нод заменена сеткой карточек: по две карточки в ряд (`md:grid-cols-2`), поиск,
счётчик «показано/всего». В карточку перенесены адрес, статус, гео (flag/код/город/IP/ASN),
ID, метрики CPU/RAM, сеть и кнопки. Отдельные колонки address/status/geo удалены.
Верхние карточки уплотнены (p-3, иконки 32px).
Живая проверка: v2.32.3, `/api/health` ok, бандл содержит `md:grid-cols-2`, страница отдаёт «Справка».

## Nodes UI v2 + help (v2.32.2, 2026-11-25)

Карточка ноды в таблице стала шире (min-w 280, общая ячейка 420) и «толще»
(`.node-card`: border 1.5px + мягкая тень): внутри имя, флаг, статус, ID/адрес, полосы
CPU/RAM и скорость сети ↑/↓ + connections из метрик агента (интервал 15 с). Кнопки
(метрики, health, cheburcheck, редактирование, apply, restart, revisions, logs) перенесены
рядом с карточкой, отдельная колонка действий удалена.
Добавлен переиспользуемый `HelpButton` (иконка «?» в новом `help` icon set) с модальным окном
на страницах: Nodes, Routing, Hosts, Rules, Reports, Alerts, Wizard.

Живая проверка: версия 2.32.2, `/api/health` ok; метрики ноды приходят в `/api/nodes`
(cpu 6.1, ram 94.13, up/down/connections), все 7 страниц отдают кнопку «Справка».
Важно: деплой v2.32.2 подтянул изменения агента 2 из main (86833fa — `User.telegramId`
уникальный). `prisma db push` потребовал `--accept-data-loss` из-за нового unique на
`telegram_id`; на проде выполнено, БД синхронизирована, backend работает.

## Cheburcheck (v2.32.0, 2026-11-25)

Кнопка «Проверить в Cheburcheck» на ноде: модальное окно с анимированным радаром и шагами,
результат (списки, гео, ASN, сканеры с region/provider/verdicts). Бэкенд читает SSE `/probe/<id>`
до `done`, token только в заголовке; результат пишется в новую модель `CheburcheckResult`.
Добавлены отчёт `/reports/cheburcheck[.csv]`, событие `CHEBURCHECK_BLOCKED` в матрицу
уведомлений и ключ `CHEBURCHECK_API_TOKEN` в зашифрованные настройки. Идея — из Mistgate
«Check now / cheburcheck», код не копировался. Документация `docs/cheburcheck.md`.
Тесты: 28 suites / 151 tests.

Живая проверка: версия 2.32.0; токен сохранён через API, в БД только `v1:`-шифртекст;
`/api/cheburcheck/status` → configured true, credits 0, сервис 1.6.3; реальная проверка ноды
`213.171.30.186` → verdict `uncertain`, 18 сканеров, гео Cloud.ru/RU, без ошибок потока;
результат сохранён, отчёт `/api/reports/cheburcheck.csv` содержит строку. Блокировки нет,
поэтому уведомление не отправлялось (журнал доставок пуст) — это корректно. Публичные
сканеры работают и при 0 кредитов; кредиты нужны только платным функциям Cheburcheck.

Настройки (v2.32.1): пользователь может указать **свой** `CHEBURCHECK_API_TOKEN` и
`CHEBURCHECK_BASE_URL` в «Оповещения → Настройки»; в UI есть ссылки на документацию
<https://cheburcheck.ru/kb/api> и форму заявки <https://forms.gle/LSPcAV5n3CrdQLMP6>.
Свой API URL проверяется на SSRF (только HTTPS в проде, нельзя приватные адреса).

Живая проверка v2.32.1: configured-ключей 15, токен сохранён, URL по умолчанию пуст;
явно заданный `https://cheburcheck.ru/api/v1` прошёл, `/status` вернул 1.6.3;
`https://127.0.0.1/api/v1` сохранён, но `/status` дал 400 (защита сработала), после чего
настройка очищена. Ссылки на документацию и форму заявки присутствуют в UI-бандле.

## Telegram-уведомления — остановились здесь (2026-11-25, issue #190)

Код поддержки Telegram готов (v2.31.0). На боевой панели сохранён токен бота
@h2oharness_bot (зашифрован), но `TELEGRAM_CHAT_ID` не задан, а api.telegram.org
недоступен с сервера в РФ (`getUpdates` вернул 0, отправка невозможна).
Перед реальным использованием токен стоит отозвать через BotFather (`/revoke`) и заменить,
так как он был показан в чате.
Дальше: прокси/relay вне РФ или отказ от Telegram в пользу Webhook/Email/Signal;
затем chat ID → матрица событий → тест канала → журнал доставок. Подробности в #190.

## Отложенные задачи (2026-11-25, по решению пользователя)

- **#185** — продолжение отчётов: финансы, per-node/per-outbound, quality-таймлайн,
  OPERATOR с изоляцией, исправление `dateWhere` в табе по организациям.
- **#186** — настройки оповещений: **реализовано в v2.31.0** (матрица событие × канал,
  зашифрованные реквизиты, SIGNAL, quiet hours, cooldown, порог важности, тест канала,
  журнал отправок, SSRF-защита webhook). Per-admin Telegram chat, эскалация и шаблоны —
  остались на следующий этап.

Живая проверка (v2.31.0): `/api/notifications/settings` вернул 13 ключей и политику без секретов;
PATCH cooldown 5 → сохранён и возвращён 0 после восстановления; маршрут `NODE_OFFLINE × SIGNAL`
принят и отключён обратно; тест не настроенного telegram вернул `reason`; при сохранении
`WEBHOOK_SECRET` в БД лежит `v1:`-шифртекст, в ответе API секрета нет, после очистки записей 0.
- Плагины/магазин/облако остаются отложенными до основного функционала (см. раздел выше).

## Traffic dynamics report (v2.30.0, 2026-11-25)

Отчёты ADMIN-only. Новая вкладка по умолчанию «Динамика трафика»: суточные корзины
`UserTraffic` (up/down), пресеты 7/30/90 дней и свой диапазон, сравнение с предыдущим
периодом, топ-5 пользователей, CSV с теми же фильтрами. Бэкенд:
`GET /reports/traffic/timeseries[.csv]`, период до 366 дней., индекс `UserTraffic(createdAt)`.
Документация: `docs/reports.md`, обновлён `docs/api.md`. Тесты: 25 suites / 140 tests.

Живая проверка: 7 дней → 7 точек; невалидная дата → 400; CSV отдаёт те же строки.
С временными тестовыми строками в БД (123456789 up + 987654321 down и строка 10 дней назад)
отчёт показал total 1111111110, previous 333333333, change +233.3%, топ пользователя;
после проверки обе строки удалены, таблица `UserTraffic` пуста.

## Dashboard polish (v2.29.1, 2026-11-25)

Дашборд уплотнён: StatCard компактнее (значение 23px вместо 30px, убрано размытие),
высота графиков 190/224 → 150/180, сетка 4 → 6 компактных карточек. Иконки на страницах
ярче (`.icon-bright`: brightness 1.18 + saturate 1.22 + свечение) и крупнее (StatCard 22px,
ссылки дашборда 18px); иконки бокового меню не тронуты (там 17px и порог bright = 18px).
Добавлены два блока: «Подключений создано» (`/api/inbounds`) и «Проблемы» (не-ok проверки
`/api/doctor`), карточка проблем ведёт на `/doctor` — там же есть безопасные исправления.
Проверено на live: версия 2.29.1, `/api/inbounds` = 3, `/api/doctor` дал 1 warning
(health_checks), карточка и подписи присутствуют в HTML дашборда (значения обновляются
после клиентской загрузки).

## Node editing and metrics (v2.29.0, 2026-11-25)

- Кнопка редактирования ноды открывает окно с параметрами мастера: имя, адрес/SSH-хост,
  локация (249 стран с флагами; флаг также показывается в списке нод, приоритет — geocheck),
  режим SSH-авторизации, пользователь/порт, IPv4/IPv6, пользовательский домен.
  Секреты (пароль/ключ/passphrase) не возвращаются API; пустое поле = оставить старое,
  новое значение шифруется AES-256-GCM. `GET/PATCH /api/wizard/nodes/:nodeId`,
  tenant-изоляция для OPERATOR (`wizard.service.ts`).
- Кнопка метрик открывает окно: состояние Xray, скорость сети (upload/download Mbps из
  метрик агента) и ping (HTTP-RTT до агента). `GET /api/nodes/:id/health` расширен
  полями `xray`, `network`, `ping`; агент пишет `xrayStatus` в `NodeMetric`.
- Живая проверка: PATCH смены имени/локации → 200 и сохранение; health вернул
  ping 12 ms, speed ~0.002/0.006 Mbps, `xray` из БД был `unknown` (старые метрики до
  деплоя), но агент в live-состоянии сообщает `xray: running` и `/metrics` с валидным
  `X-Agent-Secret` тоже `running`. Тесты: 24 suites / 137 tests.

## Nodes UI (v2.28.1, 2026-11-25)

На странице `/nodes` удалены кнопки «Установка по SSH» и «Добавить ноду» вместе с их модалками;
осталась одна кнопка «Мастер создания ноды», ведущая на `/wizard` (`frontend/src/app/nodes/page.tsx`).
Проверено: сборка frontend зелёная, live HTML `/nodes` содержит только новую кнопку,
`/wizard` → 200, backend version 2.28.1.

## Routing profiles (v2.28.0, 2026-11-25)

Профили маршрутизации теперь реально влияют на генерацию конфига (раньше `/routing` только
хранил JSON в БД): `enabled`-профили добавляются в `routing.rules`, `dns.servers`, `outbounds`
(`backend/src/modules/config/config-generator.service.ts`). Добавлены 5 рецептов
(`backend/src/modules/routing/routing-recipes.ts`), валидация(payload), tenant-изоляция
через `organizationId`, UI-пикер рецептов и кнопка «Проверить». Тестовый рецепт
`test-custom-outbound` создаёт outbound `xss-test-direct`.
Документация: `docs/routing.md`, обновлён `docs/api.md`.
Тесты: 24 suites / 134 tests.

Живая проверка на `msc.h2onetwork.pro` (v2.28.0): рецепты доступны через API,
невалидный payload отклонён (`valid:false`), создан и включён профиль `test-routing`,
конфиг применён (revision 18), агент `xray: running`, в конфиге подтверждены
`dns.servers: [9.9.9.9, ...]`, outbound `xss-test-direct` и правила `10.0.0.0/8 → xss-test-direct`,
`port 53 → direct`. Локальный `xray run -test` на выгруженном конфиге — OK,
туннель через подписку вернул `origin: 213.171.30.186`. Профиль оставлен включённым.

## Current work (2026-11-25)

v2.27.0 — автоматическая выдача доменов нодам и мастер создания ноды (issue **#176**).
Всю работу выполняет основной агент (агентские задачи #172–#175 закрыты по решению пользователя).

Что реализовано:
- CONTROL: `NodeDomain`, scope `NODE_DOMAIN`, `/api/control/domains` (allocate/list/release/bind),
  PowerDNS HTTP-клиент (A/AAAA/TXT, TTL 60), DNS-01 сертификаты certbot (в т.ч. второй домен через CNAME ACME).
- TENANT: `/wizard` — 3 шага, три режима SSH-авторизации, sudo и установка Docker,
  249 стран ISO 3166-1 alpha-2 с флагами, вызов CONTROL, inbound VLESS TLS, тесты.
- SSH-креды шифруются AES-256-GCM (`PANEL_MASTER_KEY`), в API только признак наличия.
- Инфраструктура: `docker-compose.control.yml`, режим `control` в `install.sh`, `scripts/bootstrap-dns-zone.sh`.
- Документация: `docs/control-dns.md`, `docs/node-wizard.md`.

Решения по вопросам пользователя: tenant-токен создаётся ADMIN в `/api-tokens` (raw один раз,
хеш в БД, квота безлимитная); пользовательский домен требует CNAME + ACME CNAME, серт выпускается
на оба имени; сами записи в зоне `node.h2onetwork.pro`, VLESS TLS вместо Reality.

Тесты: `npm test` — 23 suites / 127 tests, все зелёные (в т.ч. 17 новых).

Деплой на `msc.h2onetwork.pro` завершён (v2.27.0 + infra-фиксы в main):
- `docker-compose.control.yml` поднят с PowerDNS (sqlite-бэкенд, API внутри Docker-сети,
  `PDNS_BIND_IP=127.0.0.1` до публичного делегирования зоны).
- Зона `node.h2onetwork.pro` создана в PowerDNS, NS `ns1/ns2.h2onetwork.pro`.
- Живые smoke-тесты: неверный токен → 401; невалидный fingerprint мастера → 400;
  выдача домена → A/AAAA TTL 60 в PowerDNS и `dig @127.0.0.1` вернул IP;
  удаление → записи исчезли, активных доменов 0; `/wizard` → HTTP 200;
  агент `xray: running` (версия конфига 17); `/api/health` ok.
- Тестовые токены отозваны, тестовые домены удалены.

Ожидается от владельца: NS + glue у регистратора `h2onetwork.pro`
(см. `docs/control-dns.md`) и затем `PDNS_BIND_IP=0.0.0.0`.

Перед продолжением прочитать #176, `docs/control-dns.md` и `docs/node-wizard.md`.

## Latest (v2.9.0 – v2.17.1, 2026-11-24)

- Live panel: `https://msc.h2onetwork.pro` (current tag v2.17.1, `/api/health` 200, login 201).
  Node geo report works: `RU / Moscow / 213.171.30.186 / AS208677`, visible in the nodes table.
  VPN tunnel re-verified after all deploys: `httpbin.org/get` and `api.ipify.org` through the
  subscription returned `213.171.30.186` (not the local direct IP).
  MCP bridge at `/api/mcp` works with `MCP_TOKEN` from `.env` (documented in `docs/mcp.md`).
- **Real VPN test connection** is set up: `docs/test-connection.md` contains the subscription URL
  and import instructions. The agent image now includes Xray 26.11.9 and runs it as a managed
  child process (no systemd), with ports 2053 (VMess) and 2054 (VLESS Reality) published.
  End-to-end test from another machine: `httpbin.org/get` through the tunnel returned
  `origin: 213.171.30.186` (local direct IP was different) — traffic really exits via the server.
  Server: `ssh user1@213.171.30.186` with `~/.ssh/id_xss_server`; deploy from `/home/user1/xss`
  via `git reset --hard origin/main` + `docker compose up -d --build backend frontend agent`,
  followed by `npx prisma db push --skip-generate` and a backend restart when the schema changes.
- Releases: v2.9.0 HWID device limits; v2.9.1 DI fix; v2.10.0 client-eye health checks;
  v2.11.0 branded subscription templates; v2.12.0 accessibility fixes + real active-connection
  counting in the agent; v2.13.0 geosite/geoip catalog browser.
- New modules: `devices`, `health-checks`, `subscription-templates`, `geodata`.
  New pages: `/health-checks`, `/subscription-templates`, `/geodata`.
- Agent-review findings (PR #100, `docs/reports/ux-review-v2.8.md`) were fixed in v2.12.0:
  dialog semantics/focus trap, label↔input association, `role=switch`, page titles, skip link,
  search/password aria-labels, WCAG AA contrast.
- Delegated agents: #92/#107 (QA, PR #96/#94/#97/#120/#121/#123), #93 (UX report, PR #100) and
  #95 (SSH node onboarding, PR #103/#110) are closed/merged. Active: #108 (UX re-review),
  #109 (canary rollout), #125 (QA for MCP/Xray).
- v2.15.x: Xray runs inside the agent container, Xray 26 `statsquery` support, managed-restart
  race fixed, VLESS Reality test port added.
- v2.16.0: security hardening (tenant isolation for inbounds, SSRF guards in agent-client,
  OPERATOR cannot modify ADMIN, METRICS_TOKEN required in prod, traffic scoped to node org).
  Security re-audit findings #137–#140 closed.
- v2.17.x: node exit-IP geocheck with retry on startup; agent 4's `add-node.sh` JSON parsing
  hardened (PR #146). Open agent tasks: #145 (agent 2 QA), #148 (agent 4 canary rollouts).
- Blocked: per-node Let's Encrypt needs a wildcard DNS record `*.msc.h2onetwork.pro`
  pointing at `213.171.30.186` (user action).
- Still in the plan: decoy sites, canary rollouts, MCP bridge, tunnel sidecars (AmneziaWG /
  NaiveProxy / mieru).

## Goal

Self-hosted control panel for Xray-core: web UI, multi-node agents, clients, subscriptions,
payments, notifications, monitoring, Docker Compose installation. Target scale: 5k users / 20 nodes.

## Historical state (v2.6.0, 2026-11-24)

- Source of truth: the git repo `/tmp/opencode/XSS_REPO`
  (remote: https://github.com/HakunaMaruna/XreyStudioServer). `/work/XreyStudioServer` is a
  synced working copy for local inspection and `trail` commands, not an independent source.
- Published: tag/release `v2.6.0`,
  https://github.com/HakunaMaruna/XreyStudioServer/releases/tag/v2.6.0.
  Previous releases: `v2.3.0` (structured inbound settings), `v2.2.0`, `v2.1.0`.
  Earlier: `v1.4.1` (quota hotfix), `v1.4.0` (traffic/logs/admin UI), `v1.3.0`, `v1.2.0`, `v1.1.x`, `v1.0.0`.
- Stack: NestJS + Prisma/PostgreSQL + Redis, Next.js 16 + React 19, Node agent, Caddy, Docker Compose.
- Backend modules: auth (JWT + refresh + RBAC + Argon2id/bcrypt), users, nodes, inbounds, hosts,
  rules, config generator (revisions/apply/rollback), subscriptions (raw/base64/clash/singbox/json),
  metrics (Prometheus text), payments (Stripe + signed webhook), notifications (Telegram/webhook/
  SMTP/Signal + token-protected Grafana alert receiver + `AlertHistory` persistence), organizations,
  audit, traffic (per-user reports + quota enforcement).
- Frontend pages: login, dashboard, users, nodes (revision + log modals), inbounds (with edit modal),
  hosts, rules, alerts, audit, organizations, payments, plans, settings, public `/sub/[token]`
  (with QR code); i18n ru/en, dark/light theme.
  Tables use `@tanstack/react-table` via `frontend/src/components/data-table.tsx`; the users page
  uses server-side search/filter/sorting/pagination (`page`, `limit`, `search`, `status`, `role`,
  `sortBy`, `sortOrder`) and controlled sorting via `sorting`/`onSortingChange`/`manualSorting`.
- Agent: config validation/apply/rollback/restart/metrics/pull/logs, TLS/mTLS env options; detects a
  dual config (`{ xray, singbox }`), validates each engine and restarts xray/sing-box services.

## Environment constraints (important)

- `/work` does NOT support symlinks or git objects. `npm install` fails there when creating
  `node_modules/.bin` symlinks; git commands must run in `/tmp/opencode/XSS_REPO`.
- To validate, copy the relevant project into `/tmp/opencode/xss-check` (backend) or
  `/tmp/opencode/xss-check-fe` (frontend), `npm ci` there, then run commands.
- Docker/kubectl are not installed here, so image builds and `kubectl apply --dry-run` cannot be
  run locally (CI builds the images). Node here is v20.15.1; Next 16 wants >=20.19, but the
  production build passed.
- kind/k3s cannot run in this sandbox (`CapEff=0`, no `/dev/shm`); cluster rollout, in-cluster
  DNS (`backend:3000`), the `xss-backend-down` rule and Grafana ingress/TLS need a real cluster.
  Local PostgreSQL 16 works with `LD_PRELOAD=/tmp/opencode/libshmshim.so`, run as user `postgres`
  with PGDATA `/tmp/opencode/pgdata-e2e`.
- GitHub push works via the credential store in `/root/.git-credentials`.

## Done in v1.8.3

- Triaged all 17 dependabot PRs. Merged 10: GitHub Actions (metadata-action 6, build-push-action 7,
  setup-buildx 4, setup-kubectl 5, action-gh-release 3), @types/supertest 7, tailwind turbopack 4.3.5,
  eslint 10, dotenv 18, plus @types/node 26, tailwindcss 4.3.5 and express 5.3.0 applied in PR #38
  after their branches conflicted with other lockfile merges.
- Closed 5 dependency PRs whose CI fails and need a coordinated migration: @nestjs/common 12,
  @nestjs/passport 12, @tanstack/react-table 9 and TypeScript 7.
- No open PRs or issues remain. Versions bumped to 1.8.3.

## Done in v2.6.0

- Added Xray listener protocols socks/http/mixed/dokodemo-door with per-inbound account selection;
  subscription links generated for these protocols.
- Routing profiles API and page for managing routing/geodata rule sets (JSON payloads).
- Ideas inspired by lucx-ui/remnawave, implemented independently (both are copyleft licensed).
- Version 2.6.0 across artifacts.

## Done in v2.5.0

- User onboarding UX: `GET /users/:id` now returns subscription URL, key and per-format links.
  Users page has a key button with copy-to-clipboard and attach-to-inbound flow.
- Panel settings: `GET/PATCH /api/settings` (ADMIN only) persisted in `backups/panel-settings.json`;
  Settings page now edits language, theme, notification toggles, metrics, rate limit, CORS and
  session length.
- Agents split: #79 (agent 2 — E2E/QA), #80 (agent 3 — UX/a11y review).

## Done in v2.4.0

- Fallbacks: `InboundFallback` model and UI editor allow multiple protocols on one TLS port.
- Per-client limits: `InboundClient` model with per-user traffic limit, expiry, enabled flag,
  comment and subscription sort order. Generator excludes disabled/expired/over-quota clients.
- Inbound expiry also clears generated clients. Version 2.4.0 across artifacts.

## Done in v2.3.0

- Expanded inbound settings inspired by 3x-ui feature set (independently implemented; 3x-ui is
  GPL-3.0, no code copied): listen address, transport/security, flow/path/SNI/serviceName,
  per-inbound traffic limit and expiry, traffic reset schedule and day, advanced JSON settings.
- Config generator now uses the structured fields for `streamSettings`, client flow and listen.
- Inbound create/edit modal reorganized into Basic / Transport & Security / Limits / Advanced.
- docs/api.md updated; version 2.3.0 across artifacts.

## Done in v2.2.0

- One-command installer with a colored terminal menu and language selection (EN/RU) before install.
- Non-interactive flags: `--mode`, `--domain`, `--lang`, `--yes`, `--dry-run`.
- Installer generates secrets, validates DNS, shows a summary and prints final credentials.
- README RU/EN and docs/install.md updated; version 2.2.0 across artifacts.

## Done in v2.1.0

- Restored the proven original dark SaaS admin design (from v1.9.0) after the Tabler experiment
  produced a broken/cramped layout locally. Business logic and all v1.9.0 features are intact.
- Tabler artifacts (`@tabler/core`, Tabler-specific classes) removed from the frontend.

## Done in v2.0.0

- Full admin UI migration to **Tabler** (`@tabler/core`): Tabler CSS replaces Tailwind preflight,
  shell/cards/tables/forms/buttons use Tabler classes, login screen uses Tabler auth layout.
  Business logic, API and i18n are unchanged.
- Added explicit ownership lanes for the two coding agents; tasks tracked via GitHub issues #66/#67.
- Versions bumped to 2.0.0 across packages, Swagger, k8s, Helm and the frontend constant.

## Done in v1.9.0

- Automatic Let's Encrypt certificates for nodes: HTTP-01 challenge served by Caddy webroot,
  per-node hostname `node-<id>.<suffix>`, certificate issuance/push endpoints and an agent
  `/certificate` endpoint that installs the cert and switches to HTTPS.
- Compose volumes for the ACME webroot and certificate storage; `certbot` added to the backend image.
- Note: requires a DNS record `*.nodes.<domain>` pointing at the panel IP and `NODE_DOMAIN_SUFFIX`
  set. Without DNS control, ACME DNS-01 is not used.

## Done in v1.8.6

- Fixed container startup on modern Alpine: Prisma client now generates the
  `linux-musl-openssl-3.0.x` engine and the backend image installs `openssl` explicitly. Without
  this, `PrismaClientInitializationError: libssl.so.1.1 not found` prevented the API from starting.

## Done in v1.8.5

- MEDIUM audit findings: `/users/:id` restricted to ADMIN/OPERATOR, OPERATOR can no longer set or
  move `organizationId`, cross-tenant reports/audit/traffic/payments restricted to ADMIN.
- Agent URL validation blocks private networks by default (`ALLOW_PRIVATE_AGENT_URLS` for local dev),
  metrics token compared in constant time, `/metrics/view` admin proxy replaces the public
  `NEXT_PUBLIC_METRICS_TOKEN`, subscription responses set `Cache-Control: no-store`.

## Done in v1.8.4

- Fixed HIGH audit findings: secrets are now required outside explicit `development`/`test`;
  Compose sets `NODE_ENV=production` by default; agent port is bound to localhost only and the
  default agent token was replaced with a placeholder; agent token comparison uses
  `timingSafeEqual`; generated node configs only include users from the node's organization.
- `security/AUDIT.md` added with the full read-only audit; issues #43–#47 track remaining findings.

## After v1.8.4 (on main, not yet tagged)

- Added `backend/test/scale.pg-spec.ts` + `jest-scale-pg.json`, `npm run test:scale:pg`, and
  `docs/runbooks/load-test.md`. The check seeds 5k users / 20 nodes in a real PostgreSQL DB,
  measures paginated user reads and concurrent node traffic writes, and truncates the DB afterwards.
- Local run (Node 20.15.1, PostgreSQL 16, in-process supertest): 100 reads, p50 131 ms / p95 170 ms;
  20 node traffic reports (10 entries each), p50 426 ms / p95 573 ms; 0 errors, all rows persisted.
  Numbers exclude network/Ingress/TLS overhead; a real-cluster rollout test is still required.
- `--runInBand`, `SCALE_*` env knobs and optional `SCALE_P95_LIMIT_MS` budget are documented in the runbook.
- Completed the deferred `@eslint/js` 10 upgrade: PR #26 failed because `@eslint/js` 10 has a
  `peerOptional eslint@^10` dependency, so `eslint` was bumped to `^10` too (10.15.0) in both
  `package.json` and the lockfile. `typescript-eslint` 8.73 already supports ESLint 10; flat config
  needed no changes. Local Node 20.15.1 only emits EBADENGINE warnings; CI's Node 20 resolves >=20.19.
- Full backend validation with the upgraded deps: typecheck, lint (0 errors, 84 pre-existing warnings),
  10 unit, build, 11 mock e2e, 12 PG e2e and the 5k/20 scale check — all pass.
- These changes were merged after the `v1.8.4` tag, which was published by the security fix; the next
  release should bump the version again.

## Done in v1.8.2

- Restored production fail-fast secret validation after the v1.6 port: `getJwtSecret()` and
  `getBootstrapAdminPassword()` replace `change-me` / `admin12345` defaults in production.
- `.env.example` now contains valid-length placeholder secrets; README RU/EN document the requirement.
- Versions bumped to 1.8.2 across packages, Swagger, k8s images, Helm values and the frontend constant.

## Done in v1.8.1

- Fixed issue #16: `backend/tsconfig.json` now sets `esModuleInterop: true`, so the compiled
  `dist/main.js` calls `cookie-parser`/`helmet` correctly instead of throwing
  `cookie_parser_1.default is not a function`. v1.8.0 images could not start; v1.8.1 can.
- Added `backend/test/compiled-main.e2e-spec.ts`: loads the built entrypoint with NestFactory,
  Swagger and AppModule mocked and asserts both global middleware registrations. It fails when
  the flag is removed. Supertest imports in e2e specs became default imports as required by
  `esModuleInterop`.
- Merged PR #13 (v1.5/v1.6 PostgreSQL e2e), #9 (Helm chart), #10 (CI/GHCR/dependabot),
  #14 (runbooks) and #15 (k8s monitoring validation). All tracked issues are closed.

## Done in v1.8.0

- Agent can collect per-user traffic from the Xray Stats API (`XRAY_STATS_ENABLED=true`) and POST
  deltas to `/api/nodes/:id/traffic`; the config generator adds a loopback API inbound.
- Delegated agent delivered: Helm chart with ServiceMonitor/PrometheusRule, CI infra checks and
  GHCR image builds, e2e tests for v1.5/v1.6, operational runbooks and live k8s monitoring validation.
- Versions bumped to 1.8.0 in packages, Swagger, k8s images, Helm values and the frontend constant.

## Done in v1.7.0

- Configurable backup schedule and retention from the Backups page: `BackupSettings` model,
  in-process scheduler with persisted `lastRunAt`/`nextRunAt`, `GET/PATCH /api/backups/settings`,
  automatic pruning beyond the configured retention.
- Organization and protocol reporting: `GET /reports/organizations`, `GET /reports/protocols`,
  CSV exports and a `/reports` admin page with date filters and a segmented switch.
- Versions bumped to 1.7.0 across packages, Swagger, k8s images and the frontend constant.

## Done in v1.6.0

- Ported the dark SaaS admin design onto the v1.5.0 codebase: design tokens in `globals.css`,
  reusable UI kit and icon set, sidebar/topbar shell, page search, modal forms, animations and
  full RU/EN dictionaries. `globals.css` is now imported in the root layout.
- Restyled every admin page including main-only plans and traffic pages (CSV export, chart),
  backups with restore, node health/logs and editable inbounds.
- Kept all v1.5.0 backend/infra features intact; bumped versions to 1.6.0 in packages,
  Swagger, k8s image tags and the frontend version constant.

## Done in v1.5.0

- Backups UI/API: new `BackupsModule` (ADMIN only) with `GET/POST /api/backups`,
  `GET /api/backups/:name/download`, `DELETE /api/backups/:name` and
  `POST /api/backups/:name/restore` (`{ confirm: true }`). `pg_dump | gzip` snapshots in `BACKUP_DIR`
  with `BACKUP_KEEP` retention, strict `db-YYYYMMDD-HHMMSS.sql.gz` names, restore via `psql`, audit
  log entries; `postgresql-client` installed in the backend image and `./backups` mounted into the
  container by Compose. Frontend page `/backups` plus nav/i18n entries; CLI scripts still work.
- Reporting: `GET /api/traffic/chart?userId=&days=1..90` (daily UTC buckets, byte strings), CSV
  exports for traffic, audit and payments (`/api/*/export.csv`, 10 000-row cap, formula-injection
  escaping in `common/csv.ts`), `/traffic` page with a recharts LineChart, user filter and CSV
  button; Export CSV buttons on `/audit` and `/payments`. `api.download`/`api.downloadCsv` helpers.
- Redis rate limiting: `common/redis-throttler.storage.ts` implements `ThrottlerStorage` using
  ioredis (`REDIS_URL`, key prefix `xss:throttle:`), with in-memory fallback when Redis is unset or
  down; wired into `ThrottlerModule.forRoot`. `REDIS_URL` added to `.env.example`.
- Kubernetes monitoring: `k8s/monitoring.yaml` (Prometheus + Grafana Deployments/Services) and
  `k8s/generate-monitoring.mjs` producing `k8s/monitoring-config.yaml` from `monitoring/`;
  both added to `kustomization.yaml`, `make k8s-monitoring` target, k8s README instructions.
- Docs updated: README ru/en, `docs/{api,backup,install,monitoring,architecture}.md`, `k8s/README.md`,
  `.env.example`. Versions bumped to 1.5.0 (package.json + locks, Swagger, k8s image tags).

## Done in v1.4.1

- Hotfix: subscription status now reports `exceeded` before checking `status === EXPIRED`, so a
  quota-triggered expiry is distinguishable from an admin-set expiry (the real-PostgreSQL e2e
  failure in v1.4.0). Versions bumped to 1.4.1.

## Done in v1.4.0

- Per-user traffic: `UserTraffic` model + `TrafficModule`; `POST /nodes/:id/traffic` (node token)
  accepts `{ entries: [{ subscriptionToken|userId|email, up, down }] }`, writes rows, increments
  `User.trafficUsed` and sets status `EXPIRED` when the limit is reached. `GET /traffic` exposes
  paged history with byte totals. Subscription config exports return 403 for `exceeded`;
  `getStatus()` can report `exceeded`, and `refresh` now checks expiry too.
- Node logs: agent `GET /logs?service=xray|singbox&lines=N` (journalctl with `XRAY_LOG_PATH` /
  `SINGBOX_LOG_PATH` file fallback), panel proxy `GET /nodes/:id/logs` and a log viewer modal.
- Plans and payments: `Payment.planId`, optional `planId` on `POST /payments`, `PATCH /payments/plans/:id`,
  and automatic provisioning on `markPaid` (ACTIVE, traffic reset, new `expiresAt`). UI pages for
  payments and plans.
- More admin UI: audit log filtering, organizations CRUD, inbound edit modal, navigation links and
  i18n keys.
- Dockerfiles use `npm ci` with `.dockerignore` files; versions bumped to 1.4.0.
- E2E coverage: mock suite tests traffic reporting and plan provisioning; real-PostgreSQL suite
  verifies quota enforcement and paid-plan activation.

## Done in v1.3.0

- Notification channels: real SMTP email via nodemailer (`SMTP_*`, `EMAIL_FROM`, `ALERT_EMAIL_TO`),
  Signal via `signal-cli-rest-api` (`SIGNAL_API_URL`/`SIGNAL_PHONE_NUMBER`/`SIGNAL_RECIPIENT`),
  generic webhook and Telegram unified in `NotificationsService.broadcast()`, plus a
  `GET /notifications/channels` status endpoint (no secrets exposed).
- Alert persistence: new `AlertHistory` Prisma model; every Grafana alert is stored with
  status/title/message/severity/labels and exposed through `GET /notifications/alerts`
  (paged, status filter) and the new `/alerts` admin page with a channel overview.
- Users API sorting: whitelisted `sortBy`/`sortOrder` applied in SQL before pagination with a
  deterministic `id` tie-breaker; the users table sends sort state to the API (manual sorting in `DataTable`).
- QR code on the public subscription page via `qrcode.react`.
- E2E against real PostgreSQL: `backend/test/postgres.e2e-pg-spec.ts`, `test/jest-e2e-pg.json`,
  `npm run test:e2e:pg` (pushes the schema and runs the suite). CI gained a PostgreSQL 16 service
  container job and now also runs the mock e2e suite; both e2e configs have a 30s timeout.
- Bumped versions to 1.3.0 (backend/frontend/agent package.json + locks, Swagger, k8s image tags),
  updated README ru/en, docs/api.md, docs/monitoring.md, .env.example.
- Follow-up CI fix: Dockerfiles use `npm ci` without `--no-bin-links`, so `next`/`nest` binaries
  exist in the images and the `docker compose build` job passes.

## Done in v1.2.0

- Argon2id password hashing (`@node-rs/argon2`, OWASP parameters) via a global `PasswordService`
  shared by auth, users and seed. Legacy bcrypt hashes are verified transparently;
  `PASSWORD_HASHER=bcrypt` keeps new hashes bcrypt. Added a unit spec.
- Grafana alerting: file-provisioned contact point, notification policy and 4 alert rules
  (`monitoring/grafana/provisioning/alerting/alerts.yml`); alerts POST to
  `POST /api/notifications/alerts` with `Authorization: Bearer $ALERT_WEBHOOK_TOKEN` and are
  forwarded to Telegram. Docs: `docs/monitoring.md`.
- Scheduled backups: `docs/backup.md` with cron/`flock` examples, `BACKUP_DIR` variable.
- UI: full CRUD pages for hosts and rules, config revision browser with apply/rollback on the
  nodes page, server-side search/status/role filters and pagination on the users page.
  `DataTable` supports `serverPagination` and `hideSearch`.
- E2E API suite (`backend/test/app.e2e-spec.ts`, `npm run test:e2e`) boots the app with a mocked
  PrismaService: login, validation, user paging, host/rule CRUD, revisions, alert webhook auth.
- Bumped versions to 1.2.0 (package.json, Swagger, k8s image tags), updated README ru/en,
  docs/api.md, docs/install.md, docs/architecture.md, k8s/README.md, .env.example.

## Remaining plan (next work)

1. Validate in a real cluster: pod rollout, in-cluster DNS `backend:3000`, `xss-backend-down`
   alert firing, Grafana ingress/TLS. Not possible in this sandbox (see constraints above).
2. Revisit the deferred major upgrades when capacity allows: NestJS 12 (`@nestjs/common` +
   `@nestjs/passport` and the rest of the platform), TypeScript 7 and
   `@tanstack/react-table` 9. Each needs a coordinated migration and green CI.
3. Load/soak test at the target scale (5k users / 20 nodes) before production rollout. The local
   scale harness above is a first baseline; run the soak knobs from `docs/runbooks/load-test.md`
   against a deployed instance before signing off.
4. After each change: keep `/work/XreyStudioServer` in sync with the git repo, commit, push,
   update README (ru/en), docs and this HANDOFF file. Tag a new release when the stage is complete.

## Event-level notification routing (v2.23.3, 2026-11-24)

- PR #165 (`feat: event-level notification routing for real alert producers`, v2.23.3) is merged
  into `main` as `59a8e5e`; PR #164 (`AdminLTE is the default UI`, v2.23.2) merged as `08072d6`.
- Release `v2.23.3` published: tag `v2.23.3` points at commit `389b207` (version bump to 2.23.3).
  CI, Images, Live API smoke and Release bundle jobs are green on both `main` and the tag.
- `NotificationsService.emit(event, options, organizationId?)` is now the single integration point
  for real alert producers: health-checks emit `NODE_ONLINE`/`NODE_OFFLINE` only on availability
  transitions, failed backups emit `BACKUP_FAILED`, applied config revisions emit
  `CONFIG_APPLIED`, successful payments emit `PAYMENT_RECEIVED`. Grafana webhook alerts are mapped
  from labels (`alertname`, `event`, `notificationEvent`) to `NotificationEvent` and routed through
  `emit()`. `broadcast()` is retained only for the manual `POST /notifications/test` endpoint.
- Only channels enabled for the event in `NotificationRoute` are used; routes with an
  `organizationId` apply only to notifications emitted for that same organization.
- Added `PAYMENT_RECEIVED` to `NotificationEvent` in `prisma/schema.prisma`, plus frontend
  labels (`eventPaymentReceived` in ru/en) and `/api/notifications/routes` documentation in
  `docs/api.md`.
- Tests: `alert-webhook.controller.spec.ts` (event mapping), updated payments unit spec
  (emit + tenant id), `backend/test/notification-routing.e2e-pg-spec.ts` (enabled/disabled
  channels, Grafana routing, webhook delivery via a local sink). E2E validated against PGlite on
  port 5432 with `DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e?pgbouncer=true`
  (`?pgbouncer=true` avoids PGlite's prepared-statement conflict).
- Local git in `/work/XreyStudioServer/.git` cannot write objects (proot fs error); use a clean
  clone under `/tmp/opencode` for commits and publish via `git push`/GitHub API.

## Shared roadmap for code agents (2026-11-24)

- `docs/ROADMAP.md` — общий борд из 12 задач, собранных из 3x-ui, lucx-ui, remnawave
  и Mistgate. Все агенты должны отмечать статус там, документировать изменения,
  коммитить и пушить после каждой завершённой задачи.
- Задача 1 (HWID/device limit) уже реализована: `Device` model, `deviceLimit`,
  проверка в `/sub/*?hwid=`, Devices UI в Users page. Требуется только верификация
  и описание в документации, не новая реализация.

## AdminLTE completeness audit (2026-11-24)

- PR #164 (`08072d6`) made AdminLTE the default UI. Audit: functional AdminLTE shell
  (`frontend/src/components/adminlte-shell.tsx`), grouped menu with all 21 admin pages present,
  shared Card/SectionTitle/Field/EmptyState components have AdminLTE branches, assets copied by
  `prebuild`, no TODO/FIXME/stubs in the frontend. Legacy Aurora UI intentionally kept behind
  `NEXT_PUBLIC_UI=aurora` / `localStorage=xss_ui`.
- Found and fixed unfinished edges in commit `f121bad`: READMEs still advertised v2.6.1 and the
  old dark SaaS UI (now v2.23.3 + AdminLTE section, EN/RU), and the UI-switch button labels were
  hardcoded English (`title="Switch UI"`, `label="Switch to AdminLTE UI"`); added `switchUi` /
  `switchToAdminLte` keys to both i18n dictionaries (346 keys parity) and used them in both shells.
- Verified locally: `npx tsc --noEmit`, `npx eslint` (0 errors), `npx next build --webpack` pass;
  CI/Images/Smoke green on main. Turbopack `npm run build` still fails locally on Node 20.15 only.

## Session context (final, 2026-11-24)

- Version bumped to `2.23.3` in `backend/src/version.ts`, `frontend/src/lib/version.ts`,
  both `package.json` and both `package-lock.json`; pushed as `389b207`.
- Local verification (clean clone `/tmp/opencode/xss-work-225`): backend `npm run typecheck`,
  `npm run lint` (warnings only), `npm test -- --runInBand` (31 passed), `npm run test:e2e`
  (11 passed), `npm run build` — all OK. Frontend `npx tsc --noEmit` OK.
- GitHub Release `v2.23.3` published (release id 457088550) with assets
  `xreystudio-v2.23.3.tar.gz` and `xreystudio-v2.23.3.zip`; CI, Images, Live API smoke and
  Release bundle are green on main and on the tag.
- Frontend build: added `@adminlte/react`'s optional peers as direct dependencies
  (`chart.js`, `flatpickr`, `jsvectormap`, `quill`, `sortablejs`, `tabulator-tables`,
  `tom-select`) in commit `7dac71b`; `npx next build --webpack`, `npm run lint`,
  `npx tsc --noEmit` all pass locally. Turbopack (`npm run build`) still fails locally on
  Node 20.15 because `magic-string@1.4.5` is ESM-only and CJS `require()` cannot load it;
  CI uses Node 20 latest (with require(esm)) and is green — no source change needed.
- PG e2e `test/v15.e2e-pg-spec.ts` skipped locally: local pg_dump 16 cannot dump PGlite 19
  (Alpine has pg_dump <=16; CI uses PostgreSQL 16 and passes). Other PG suites: 15 suites /
  69 tests passed with `DATABASE_URL=...?pgbouncer=true`.
- `/work/XreyStudioServer` recloned from GitHub main, synced to `a5438b1` by copying loose
  git objects from `/tmp/opencode/xss-work-225` (proot blocks git object writes directly);
  working tree clean. `core.filemode=false` set locally; `graft/` preserved;
  `temp_git/` is local scratch now ignored via `.gitignore`; old checkout in
  `/work/.trash/2026-11-24-XreyStudioServer.old/`.
- npm ci in `/work` fails with EACCES on symlinks (proot); use `/tmp/opencode` clone for
  installing dependencies and running tests.

## Commands

```bash
trail build /work/XreyStudioServer            # refresh code map into graft/
trail ask "where is Stripe webhook verified" /work/XreyStudioServer
trail note --title "..." -m "..." /work/XreyStudioServer

# backend validation (in /tmp/opencode/xss-check)
npm run typecheck && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e
DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:e2e:pg
# frontend validation (in /tmp/opencode/xss-check-fe)
npm run lint && npm run build

# git (in /tmp/opencode/XSS_REPO)
git add -A && git commit -m "..." && git push origin main
```

## Roadmap session (tasks 1–12, 2026-11-24)

All 12 ideas from `docs/ROADMAP.md` are implemented and pushed, one commit per task:

- 1 HWID/device limit — verified and documented (`7241c48`).
- 2 Decoy page and hidden admin login (`1690cfa`).
- 3 Personal subscription page with browser HWID binding (`5313684`).
- 4 Profile-to-node binding and per-node traffic (`7499328`).
- 5 SSH provisioning from UI (`9a1d229`).
- 6 Doctor read-only checks with allow-listed fixes (`9fe1cea`).
- 7 Ed25519 signed updates (`d40ce18`).
- 8 AES-256-GCM backup encryption and S3/R2 upload (`b39566f`).
- 9 Subscription format selection by User-Agent (`10d80bb`).
- 10 Telegram bot with signed one-time login (`3a5b0dc`).
- 11 Rescue CLI for password/admin recovery (`3a5b0dc`).
- 12 MCP write-plans with owner approval (`3a5b0dc`).

A parallel AdminLTE restyle commit (`89b085c`, v2.24.0) landed while tasks 10–12 were in
flight; our commit was cleanly rebased onto it. Local validation after tasks 10–12:
backend typecheck rc=0, lint rc=0 (141 pre-existing `no-explicit-any` warnings, zero errors),
unit 19 suites / 110 tests, `npm run test:e2e` 2 suites / 11 tests, nest build rc=0,
`node dist/scripts/rescue-cli.js --help` rc=0, code_review zero findings.
Local PG e2e remains skipped (pg_dump 16 cannot dump PGlite 19). CI is the authority.

## Documentation, UI screenshots and SEO (9719eac)

- Added `docs/processes.md` (end-to-end Mermaid diagrams for install, node onboarding,
  subscription/HWID, backup/restore, health/doctor, Telegram/MCP) and `docs/user-guide.md`
  with real headless-Chromium screenshots in `docs/screenshots/` (login, decoy, public docs).
- Expanded `docs/install.md` (verification checklist, rollback) and `docs/backup.md`
  (AES-256-GCM format, S3/R2 step-by-step, restore drill).
- Added public SSR `/docs` with metadata, canonical URL, Open Graph/Twitter, JSON-LD, plus
  `robots.ts` and `sitemap.ts`. Private routes (`/login`, `/sub/*`, `/api/*` and admin screens)
  are `noindex` and disallowed. `NEXT_PUBLIC_SITE_URL` controls canonical/sitemap origin;
  Host headers are not trusted. Whitelisted public routes bypass decoy/middleware redirects.
- Updated README EN/RU with TOCs, doc links and keywords; added SEO sections to
  `docs-content.ts`; theme init moved to static `/theme-init.js` (no inline-script injection).
- Local validation: tsc rc=0, next build (webpack) rc=0, lint 0 errors, backend unit
  19 suites / 110 tests, code_review 0 findings. Turbopack build fails locally on Node 20.15
  (`magic-string` ESM); webpack build and CI are the authority.
- Follow-up CI repairs on top of this work: removed unused assignments in `wizard.service.ts`
  and its spec, updated the rule-creation e2e payload to the current validation contract,
  and mocked `AgentClientService.ping` in the PostgreSQL rollout suite (its health endpoint
  now calls ping). The temporary workflow diagnostics used to capture the remote failure were
  reverted. Final GitHub CI on `9719eac`: CI, Images and Live API smoke all green; local
  backend typecheck/lint/unit (24 suites / 137 tests)/e2e (2 suites / 11 tests) and frontend
  tsc/lint/build (webpack) all rc=0, code_review 0 findings.


## Bulk inbound users and Telegram id (2026-11-25)

- Added `POST /api/inbounds/:inboundId/users/bulk` with `mode: add|remove` and
  `scope: selected|all|squad`. Targets are resolved and tenant-filtered on the server;
  selected ids are validated as UUIDs (max 5000), `squadId` must belong to the caller's
  organization, and the inbound is checked through the existing `findOne` access rules.
  Writes use `createMany(skipDuplicates)` / `deleteMany` and are audit-logged.
- Added optional unique numeric `User.telegramId`, exposed in user DTOs and UI. Telegram links
  are rendered only from validated digits with `target="_blank" rel="noopener noreferrer"`.
- UI: row selection + bulk toolbar/modal on `/users`, Telegram link on the user card and in the
  group member list; RU/EN i18n keys added. Docs updated in `docs/api.md` and `docs/user-guide.md`.
- Validation in the working clone: backend typecheck/lint/build rc=0 and unit tests 25 suites /
  140 tests passed; new PG e2e suite 3/3 passed against PGlite on 127.0.0.1:5434 with
  `?pgbouncer=true`; frontend tsc/lint rc=0 and production build (webpack) rc=0. The stock
  Turbopack build still fails locally on Node 20.15 (`magic-string` ESM), as before.
  Running the whole PG e2e suite locally is not authoritative: 15 pre-existing suites fail in
  this PGlite snapshot with `relation "AlertHistory" does not exist` during their own raw
  TRUNCATE reset; CI with real PostgreSQL remains the source of truth. code_review: 0 findings.

## Settings hub and CI repair (2026-11-25, main 912fdba)

- Reworked `/settings` into a unified hub: notification policy/quiet hours/severity/escalation
  and backup schedule/retention now call the same APIs as the Alerts and Backups pages; channel
  status cards show only configured/not configured (no secrets) and link to `/alerts` for
  credentials. Added quick links to routing, templates, tokens, backups, doctor and DNS
  (DNS link only when `GET /api/dns/status` reports `mode: control`).
- Local appearance/behaviour toggles remain in browser localStorage. RU/EN i18n keys added;
  docs: new `docs/settings-hub.md` and an update to `docs/user-guide.md`.
- Follow-up commits from other work added DNS and DNSSEC sections; the CI backend lint job
  failed on two pre-existing spec issues (`no-var-requires` in `dns-admin.service.spec.ts`,
  unused `appendFileSync` in `backup-crypto.spec.ts`). Fixed both after rebasing onto current
  `main` (17ccd72).
- Validation: frontend tsc rc=0, eslint rc=0 (warnings only), `next build --webpack` rc=0;
  backend lint rc=0 and focused Jest suites 8/8 passed; `git diff --check` clean; code_review
  0 findings. GitHub CI on 912fdba: backend, frontend, docker, e2e-postgres, images and smoke
  all success.


## System snapshots / rollback (2026-11-25)

- Added an ADMIN-only snapshots module: immutable DB+settings artifacts under
  `BACKUP_DIR/snapshots/<uuid>` with a checksummed manifest, Prisma metadata (`SystemSnapshot`,
  `SnapshotPolicy`, new enums), policy with cooldown/retention, dry-run restore, explicit
  confirmation, pre-restore snapshot, audit records and fail-closed auto snapshots before
  serious settings mutations.
- Declarative `@SnapshotBefore('settings'|'update')` + global interceptor cover settings,
  notification settings, backup settings, config profiles and routing mutations; the shell
  `scripts/rollout.sh` creates a pre-update snapshot before any node changes.
- UI: new **State snapshots** tab on `/settings` with create/list/policy/restore/delete and a
  two-step confirmation; RU/EN i18n keys added.
- CLI/docs: `scripts/snapshot.sh` works online via JWT or offline from the snapshot directory,
  with dry-run first; Makefile targets and docs (`docs/snapshots.md`, `docs/api.md`,
  `docs/user-guide.md`, restore drill) updated.
- Validation: backend tsc/lint/build rc=0; focused Jest 5/5; frontend tsc/lint rc=0 and
  `next build --webpack` rc=0; shell syntax checked; code_review 0 findings.

CI note for this change: backend lint failure introduced by the remote balancers commits was fixed in `ffac643`; `e2e-postgres` was already failing on parent commits `60abcd5`/`d893ede` before snapshots landed and could not be reproduced locally because proot PostgreSQL cannot allocate shared memory (`shmget` unavailable).

## selfSNI and decoy site for node inbounds (2026-11-25)

- Clarified terminology: official Xray has no separate `selfSNI` key. The panel uses
  `tlsSettings.serverName = <node domain>` on the default wizard inbound (`vless+tcp+tls`),
  so the client repeats the panel-issued node domain in TLS ClientHello.
- The wizard now stores `settings.fallbackDest` / `fallbackAlpn` on that inbound; the config
  generator emits a static Xray `fallback` to a loopback decoy web server and sets
  `tlsSettings.alpn: ["http/1.1"]` (required by Xray fallbacks). Existing tagged
  `fallbacks[]` are merged with static ones instead of being overwritten.
- Agent serves a minimal neutral HTML page on `127.0.0.1:18080` by default
  (`NODE_STUB_PORT`, `NODE_STUB_ENABLED=false` to disable); it is never bound to a public
  interface.
- Tests: `config-generator.service.spec.ts` verifies selfSNI + fallback emission;
  `wizard.service.spec.ts` verifies the default inbound settings. Focused Jest 13/13 green.
- Docs updated: `docs/node-onboarding.md` (new selfSNI section), `docs/hosts.md`,
  `docs/api.md`.

CI verification for e54a395: smoke, docker, backend, frontend, both image builds green.
`e2e-postgres` fails in `test/rollout-api.e2e-pg-spec.ts` with
`this.agentClient.ping is not a function` — pre-existing issue #188, unrelated to
selfSNI/decoy changes.

Node-card ping display: `GET /api/nodes/pings` returns tenant-scoped latency per node
(`null` when unreachable). Cards show ping above RAM: green <= 100 ms, yellow 101-300 ms,
red > 300 ms, grey when no data; the bar and quality label match the colour.
