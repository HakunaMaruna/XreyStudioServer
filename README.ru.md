# XreyStudioServer (XSS)

Self-hosted панель управления **Xray-core** с агентами нод, управлением клиентами, выдачей подписок, платежами, интеграцией с Telegram и мониторингом.

> Краткое название: **XSS** · Репозиторий: `XreyStudioServer` · Текущая версия: **v2.23.3**

Самостоятельная панель Xray VPN: управление нодами, подписками и трафиком, лимит устройств
по HWID, зашифрованные бэкапы и подробно описанные рабочие процессы.

**Ключевые слова:** self-hosted VPN панель, Xray панель управления, подписки VPN, шифрование бэкапов, Prometheus метрики.

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Документация](#документация)
- [Тесты и CI](#тесты-и-ci)
- [Планы](#планы)
- [Лицензия](#лицензия)

---

## Возможности

- Веб-панель администратора: пользователи, клиенты, ноды, inbound-конфигурации, хосты, правила.
- Лимиты трафика, срок действия, статусы, протоколы и ключи.
- Управление несколькими нодами: регистрация, health check, метрики, логи, перезапуск Xray.
- Генерация конфигураций Xray, проверка, применение и откат.
- Публичная страница подписки с QR-кодами и инструкциями для клиентов.
- Форматы подписки: raw, base64, Clash / Clash Meta, sing-box, JSON.
- Автоопределение формата по `User-Agent`.
- RBAC: `ADMIN`, `OPERATOR`, `USER`.
- Лимит устройств по HWID: привязка по токену подписки, отзыв на странице пользователя и отказ
  не зарегистрированным устройствам при достижении лимита.
- Multi-tenant организации и white-label брендирование.
- Аудит действий, резервное копирование и восстановление.
- Платежи, тарифы, триалы, рефералы и реселлеры (расширяемо).
- Уведомления через Telegram, webhook, SMTP email и Signal (`signal-cli-rest-api`).
- Панель на базе AdminLTE по умолчанию (v2.23.2): сайдбар, карточки и таблицы, светлая и тёмная темы,
  полные переводы RU/EN и мобильная адаптивность. Старый интерфейс Aurora доступен переключателем
  в UI или через `NEXT_PUBLIC_UI=aurora`.
- Таблицы с поиском, сортировкой и пагинацией, формы редактирования и графики на дашборде.
- История алертов в PostgreSQL с интерфейсом просмотра и статусом каналов уведомлений.
- Hysteria2 / TUIC / WireGuard через адаптер sing-box на ноде.
- Метрики Prometheus, готовый дашборд и правила алертов Grafana; манифесты Kubernetes.
- Полный CRUD UI для хостов и правил маршрутизации, просмотр ревизий конфига с откатом.
- Серверный поиск, сортировка, фильтрация и пагинация для больших списков пользователей.
- Алерты Grafana с доставкой через защищённый токеном webhook.
- Хеширование паролей Argon2id с прозрачной поддержкой существующих bcrypt-хешей.
- Учёт трафика пользователей по отчётам нод с хранением по периодам и автоматическим лимитом.
- Отчёты по организациям и протоколам с экспортом в CSV.
- UI аудита, организаций, платежей, тарифов, редактирование inbound и просмотр логов нод.
- Оплаченный тариф автоматически активирует пользователя, сбрасывает трафик и задаёт срок действия.
- Управление бэкапами и восстановлением в UI, дневные графики трафика и экспорт отчётов в CSV.
- Глобальный rate limiting через Redis (общий для реплик) с переходом на память при недоступности Redis.

## Архитектура

```text
                    ┌─────────────────────────────┐
                    │        Caddy (TLS)          │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
     ┌────────▼────────┐                       ┌────────▼────────┐
     │  Next.js Panel  │                       │  Public /sub    │
     │  + Admin UI     │                       │  Subscription   │
     └────────┬────────┘                       └────────┬────────┘
              │                                         │
              └────────────────────┬────────────────────┘
                                   │ REST / JWT
                          ┌────────▼────────┐
                          │  NestJS Backend │
                          │  Prisma + Redis │
                          └───┬─────────┬───┘
                              │         │
                    ┌─────────▼──┐  ┌───▼──────────┐
                    │ PostgreSQL │  │ Redis Cache  │
                    └────────────┘  └──────────────┘
                              │ mTLS / signed token
                    ┌─────────▼─────────────┐
                    │  Node Agent + Xray    │
                    └───────────────────────┘
```

## Технологический стек

| Слой | Выбор | Почему |
|---|---|---|
| Backend | **NestJS (TypeScript)** | Модульная чистая архитектура, DI, OpenAPI, быстрая разработка CRUD |
| Frontend | **Next.js + React** | SSR для страницы подписки, App Router, большая экосистема |
| UI | **Tailwind CSS + shadcn/ui** | Быстрый, доступный, кастомизируемый интерфейс |
| БД | **PostgreSQL** | Надёжное реляционное хранилище, JSONB, целостность |
| Кэш/очереди | **Redis** | Сессии, rate limiting, задачи BullMQ |
| Агент | **Node.js** | Лёгкий, тот же язык, простая установка |
| Прокси/TLS | **Caddy** | Автоматический HTTPS, простая конфигурация |
| Контейнеры | **Docker Compose** | Достаточно для 5к пользователей / 20 нод, простота эксплуатации |
| Контейнеры (альтернатива) | **Kubernetes** | Манифесты Kustomize в `k8s/` с Ingress и TLS |

## Структура репозитория

```text
XreyStudioServer/
├── backend/                 # NestJS API, Prisma schema
│   ├── prisma/schema.prisma
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── modules/{auth,users,nodes,subscriptions,health}
├── frontend/                # Next.js админка + страница подписки
│   └── src/app/{dashboard,sub/[token]}
├── agent/                   # Node-агент для нод Xray
├── k8s/                     # манифесты Kubernetes (Kustomize)
├── monitoring/              # конфиги Prometheus, дашборд и алерты Grafana
├── scripts/                 # скрипты бэкапа/восстановления, пример cron в docs
├── docs/                    # архитектура, установка, API
├── .github/workflows/ci.yml # lint, typecheck, build, docker
├── docker-compose.yml
├── Caddyfile
├── install.sh
├── Makefile
├── .env.example
├── README.md                # английский
└── README.ru.md             # русский
```

## Быстрый старт

### Требования

- Ubuntu 22.04/24.04 или Debian 12
- Docker и Docker Compose plugin
- Домен, направленный на сервер (для автоматического TLS)

### Установка

Одной командой — с интерактивным меню (язык + режим установки):

```bash
curl -fsSL https://raw.githubusercontent.com/HakunaMaruna/XreyStudioServer/main/install.sh | bash
```

Или в неинтерактивном режиме:

```bash
git clone https://github.com/HakunaMaruna/XreyStudioServer.git
cd XreyStudioServer
./install.sh --mode all-in-one --domain your-domain.com --lang ru --yes
```

Установщик сначала спрашивает язык (`en`/`ru`) и режим, генерирует секреты, проверяет DNS и запускает выбранные сервисы. Флаг `--dry-run` позволяет посмотреть действия без выполнения.

### Режимы установки

| Режим | Описание |
|---|---|
| `panel` | Только панель (backend, БД, Redis, Caddy) |
| `node` | Только агент ноды + Xray |
| `subscription` | Только публичная страница подписки |
| `all-in-one` | Панель, агент и страница подписки на одном сервере |

```bash
./install.sh panel panel.example.com
./install.sh node node1.example.com
./install.sh subscription sub.example.com
./install.sh all-in-one example.com
```

### Makefile

```bash
make install     # запустить install.sh
make up          # docker compose up -d
make down        # docker compose down
make logs        # логи
make update      # pull, rebuild, restart
make backup      # сжатый дамп PostgreSQL (последние 7 копий)
make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz
make monitoring     # запустить Prometheus + Grafana
make k8s-monitoring # обновить ConfigMap'ы мониторинга для Kubernetes из monitoring/
```

Обновление: `make update` (пересборка и перезапуск), схема БД применяется автоматически через
`prisma db push`. Перед обновлением сделайте бэкап: `make backup`. Настройка отчётов о трафике,
тарифов и логов нод описана в `docs/install.md`.

## Конфигурация

Скопируйте `.env.example` в `.env` и задайте минимум:

```env
DOMAIN=example.com
PANEL_URL=https://example.com
POSTGRES_USER=xss
POSTGRES_PASSWORD=strong-password
POSTGRES_DB=xss
JWT_SECRET=random-64-hex
JWT_REFRESH_SECRET=random-64-hex
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-admin-password
AGENT_TOKEN=random-agent-token
CORS_ORIGIN=https://example.com
```

Опционально: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_URL`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`/`ALERT_EMAIL_TO`, `SIGNAL_API_URL`/`SIGNAL_PHONE_NUMBER`/`SIGNAL_RECIPIENT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (обязателен для Stripe-вебхуков), `METRICS_TOKEN`, `REDIS_URL` (общий rate limiting; при отсутствии — память), `THROTTLE_TTL`, `THROTTLE_LIMIT`, `GRAFANA_PASSWORD`, `BACKUP_DIR`, `BACKUP_KEEP`, `PASSWORD_HASHER` (`argon2id` по умолчанию, `bcrypt` для новых хешей), `ALERT_WEBHOOK_TOKEN` (общий секрет для алертов Grafana), `AGENT_CA`/`AGENT_CERT`/`AGENT_KEY` (mTLS с агентами), `SINGBOX_CONFIG_PATH`/`SINGBOX_BIN`/`SINGBOX_SERVICE` (не-Xray протоколы), `XRAY_LOG_PATH`/`SINGBOX_LOG_PATH` (резервный источник логов агента, если нет `journalctl`), `NEXT_PUBLIC_UI` (`aurora` — оставить старый UI; по умолчанию AdminLTE).

## Скрытый вход в панель (режим decoy)

Установите `PANEL_DECOY=true` и `PANEL_ENTRY_PATH=<секрет>` (6–64 буквы, цифры, `-` или `_`):
публичный адрес будет отдавать безобидную страницу-заглушку, а панель — только по адресу
`/<секрет>/login` либо в браузере, который уже выполнил вход. После успешного входа ставится
httpOnly-cookie **только для маршрутизации**; она не является пропуском — каждый запрос `/api`
попрежнему защищён JWT. Загрузки подписок `/sub/*` и `/api/*` не затрагиваются. Если секрет
не задан или имеет неверный формат, вход не открывается (fail closed).

## Интерфейс AdminLTE

Начиная с v2.23.2 фронтенд использует оболочку AdminLTE (`frontend/src/components/adminlte-shell.tsx`)
с группированным сайдбаром для всех страниц, общими карточками/таблицами/кнопками и переводами RU/EN.
Ассеты AdminLTE копируются в `public/vendor` скриптом `prebuild`. Старый интерфейс Aurora сохранён
для совместимости: переключите его в UI или задайте `NEXT_PUBLIC_UI=aurora` перед сборкой; выбор
сохраняется в `localStorage` под ключом `xss_ui`.

## API

- Swagger UI: `https://<domain>/docs`
- Базовый путь: `/api`

Основные эндпоинты:

```text
POST /api/auth/login
POST /api/auth/refresh
GET  /api/users
POST /api/users
GET  /api/nodes
POST /api/nodes
GET  /api/nodes/:id/health
GET  /api/subscriptions/:token
GET  /api/subscriptions/:token/raw
GET  /api/subscriptions/:token/base64
POST /api/nodes/:id/traffic
GET  /api/nodes/:id/logs
GET  /api/traffic
GET  /api/traffic/chart
GET  /api/traffic/export.csv
GET  /api/audit
GET  /api/audit/export.csv
GET  /api/payments/export.csv
GET  /api/payments/plans
GET  /api/backups
POST /api/backups
POST /api/backups/:name/restore
GET  /api/metrics
POST /api/payments/webhook
GET  /api/health
```

## Подписки

Публичный URL:

```text
https://<domain>/sub/<token>
```

Поддерживаемые форматы:

- raw-ссылки
- base64
- Clash / Clash Meta
- sing-box
- JSON

Формат выбирается по `User-Agent` клиента; страница также показывает QR-коды и инструкции для платформ.
Для Hysteria2, TUIC и WireGuard формируются нативные ссылки `hysteria2://`, `tuic://`,
`wireguard://` и прокси-записи для Clash Meta / sing-box.

## Безопасность

- HTTPS обязателен (Caddy).
- JWT access + refresh токены.
- Хеширование паролей Argon2id (существующие bcrypt-хеши продолжают работать).
- Глобальный rate limiting API через Redis (резерв — память) + отдельные лимиты на логин/refresh.
- В проде запуск прерывается, если `JWT_SECRET` короче 32 символов или `ADMIN_PASSWORD` короче 12.
- Проверка подписи Stripe-вебхуков (HMAC-SHA256, допуск 5 минут).
- Защита от CSRF/XSS/SQL-инъекций/IDOR.
- Шифрование секретов нод в БД.
- mTLS или подписанные токены между панелью и агентом.
- Контейнеры с минимальными привилегиями.
- Аудит без хранения секретов в открытом виде.

### Канал до агента

Порт API агента не публикуется на хост (Compose/K8s): агент доступен только во внутренней сети.
Бэкенд использует `AGENT_BASE_URL` (`http://agent:9090` в Compose) для нод без явного `agentUrl`;
Helm подставляет адрес сервиса агента в кластере автоматически. `install.sh` генерирует случайный
`AGENT_TOKEN`: агент передаёт его панели, а панель отправляет его в заголовке `X-Agent-Secret`
при вызове конфигурации и логов (сравнение с константным временем на обеих сторонах).

Для агентов на других хостах `agentUrl` в проде обязан использовать `https://`: завершайте mTLS на
reverse-прокси и доверяйте там клиентскому сертификату панели. `ALLOW_PRIVATE_AGENT_URLS=true`
ослабляет проверки приватных адресов и HTTPS, поэтому его можно включать только в доверенных
частных сетях. Внутренний `AGENT_BASE_URL` остаётся HTTP внутри сети Compose/K8s. Токен подписки
по дизайну API находится в пути URL, поэтому ответы подписки отправляют `Cache-Control: no-store`
и `Referrer-Policy: no-referrer`; храните access-логи в приватном месте и ротируйте утекший токен.

## Мониторинг

- Встроенные метрики нод: CPU, RAM, диск, трафик, активные подключения, состояние Xray.
- Health checks и алерты при недоступности нод.
- Prometheus-совместимый endpoint `GET /api/metrics` (при публичном доступе задайте `METRICS_TOKEN` и передавайте заголовок `X-Metrics-Token`).
- Опциональный стек Prometheus + Grafana через `make monitoring`: Prometheus `:9091`, Grafana `:3002` с предустановленным дашбордом `XreyStudioServer — Overview`. В Kubernetes стек уже включён в `k8s/`: `node k8s/generate-monitoring.mjs` обновляет ConfigMap'ы из `monitoring/`, доступ через `kubectl port-forward`.
- Правила алертов (`monitoring/grafana/provisioning/alerting/alerts.yml`)покрывают : недоступность backend, офлайн-ноды, высокий расход памяти backend и CPU ноды. Алерты уходят на `POST /api/notifications/alerts` с заголовком `Authorization: Bearer $ALERT_WEBHOOK_TOKEN` и пересылаются в Telegram, webhook, email (SMTP) и Signal. Каждый алерт сохраняется в таблице
`AlertHistory` и доступен на странице **Оповещения** (`/alerts`), где также показаны настроенные
каналы. Настройка каналов описана в `docs/monitoring.md`.

## Бэкап и восстановление

```bash
make backup
make restore FILE=backups/db-20260101-120000.sql.gz
```

Бэкапы — сжатые дампы PostgreSQL в каталоге `backups/`; `BACKUP_DIR` задаёт каталог, `BACKUP_KEEP` — число хранимых копий (по умолчанию 7). Администратор может создавать, скачивать, удалять и восстанавливать копии на странице **Бэкапы** (`/backups`); восстановление требует явного подтверждения. Образ backend содержит `postgresql-client`, а Compose монтирует `./backups` в контейнер — CLI и UI работают с одним каталогом. Рабочий процесс UI, пример cron и копирование на удалённое хранилище — в `docs/backup.md`.

### Терминальное меню (`xss`)

В режимах `panel`, `all-in-one` и `control` установщик создаёт ссылку `/usr/local/bin/xss`
на `scripts/xss`. Запуск:

```bash
xss start
```

Меню показывает последние снимки с датой/временем UTC, событием, размером и файлом, а также
позволяет создавать снимки, восстанавливать систему, обновлять и пересобирать панель, смотреть
статус и логи, останавливать и запускать сервисы. Используются обычные ANSI-цвета; `whiptail`,
`dialog` и `gum` не нужны.

```bash
xss snapshots          # дата, время (UTC), событие, размер
xss backup             # шифруется при BACKUP_ENCRYPTION_KEY
xss restore [СНИМОК]   # pre-restore, временная БД и безопасная замена
xss status
xss logs backend
```

Восстановление создаёт снимок `pre-restore`, импортирует дамп во временную БД и меняет базы
только после успешного импорта. Если панель не запустилась, старая БД остаётся под именем
`xss_prev_*`, и команда печатает это имя.

При заданном `BACKUP_ENCRYPTION_KEY` команда `xss` шифрует снимок через backend и требует
стандартный каталог `./backups` и сервис `backend`. Если зашифровать нельзя, команда завершается
ошибкой и не оставляет незашифрованный снимок. `make backup` и `scripts/backup.sh` по-прежнему
создают plaintext.

Полное описание команд, событий снимков, ошибок и ручной установки ссылки — в
[Terminal CLI](docs/cli.md).

## Адаптеры протоколов

Xray-core поддерживает VLESS, VMess, Trojan и Shadowsocks. Hysteria2, TUIC и WireGuard
формируются в отдельный конфиг [sing-box](https://sing-box.sagernet.org/), поскольку Xray их не
реализует. Панель отправляет агенту двойной конфиг (`xray` + `singbox`), агент проверяет каждый
движок (`xray run -test` / `sing-box check`) и перезапускает нужный сервис. Устанавливайте
`sing-box` на нодах с такими подключениями; без внешних inbound-ов используется обычный
одиночный конфиг Xray. В подписках есть нативные ссылки для всех трёх протоколов.

## Kubernetes

В `k8s/` лежат манифесты Kustomize для PostgreSQL, Redis, API, панели, агента, Ingress и стека
Prometheus + Grafana с готовым дашбордом и алертами XSS. После изменений в `monitoring/` обновите
ConfigMap'ы: `make k8s-monitoring` (или `node k8s/generate-monitoring.mjs`). Шаги по сборке образов,
секретам, применению и port-forward — в `k8s/README.md`. Это альтернатива Compose,
а не дополнительное требование.

## Разработка

```bash
# backend
cd backend && npm install && npm run start:dev

# frontend
cd frontend && npm install && npm run dev

# agent
cd agent && npm install && npm start
```

## Документация

Начните с [руководства по интерфейсу](docs/user-guide.md) и [схем процессов](docs/processes.md).
Полный комплект руководств находится в [`docs/`](docs/):

- [Установка](docs/install.md) — режимы, чек-лист проверки и откат.
- [Подключение ноды](docs/node-onboarding.md) — агент, токен и проверка трафика.
- [Подписки и проверка подключения](docs/test-connection.md) — форматы, лимит HWID, клиенты.
- [Бэкап и восстановление](docs/backup.md) — AES-256-GCM и S3/R2.
- [Терминальный CLI](docs/cli.md) — `xss start`, снимки с событиями, восстановление и пересборка.
- [Рабочие процессы](docs/processes.md) — сквозные сценарии со схемами.
- [Интерфейс оператора](docs/user-guide.md) — скриншоты входа, decoy-режима и публичных доков.
- [API](docs/api.md) и [MCP](docs/mcp.md).
- [Ранбуки](docs/runbooks/) — инциденты, репетиции восстановления, нагрузочные тесты.
- [Roadmap](docs/ROADMAP.md) — выполненное и запланированное.

![Экран входа](docs/screenshots/login.png)

Публичная документация также доступна по `/docs`: robots.txt, sitemap.xml, канонические ссылки и
Open Graph. Укажите `NEXT_PUBLIC_SITE_URL` равным внешнему адресу панели.

## Тесты и CI

- `cd backend && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`
- `DATABASE_URL=postgres://xss:xss@127.0.0.1:5432/xss_e2e npm run test:e2e:pg` — API-тесты против реальной PostgreSQL (схема создаётся автоматически; используйте временную БД).
- `cd frontend && npm run lint && npm run build`
- Сборка Docker-образов.
- GitHub Actions (`.github/workflows/ci.yml`): линтеры, typecheck, юнит-тесты, оба e2e-набора (с сервисом PostgreSQL 16), сборки и Compose.

## Планы

- Расписание бэкапов и управление хранением копий из UI.
- Отчёты по организациям и разбивка трафика по протоколам.
- Helm-чарт и примеры интеграции с уже работающим Prometheus Operator.

## Лицензия

[GNU Affero General Public License v3.0 или позднее](LICENSE) (`SPDX-License-Identifier: AGPL-3.0-or-later`).

XreyStudioServer — свободное ПО. Если вы модифицируете панель и предоставляете
её пользователям по сети, пункт 13 AGPL обязывает предложить им исходный код
вашей версии. Подробности, сторонние компоненты и проверку подписи релизов
смотрите в [NOTICE](NOTICE) и [docs/IP-POLICY.md](docs/IP-POLICY.md).
