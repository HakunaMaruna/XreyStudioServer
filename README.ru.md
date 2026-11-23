# XreyStudioServer (XSS)

Self-hosted панель управления **Xray-core** с агентами нод, управлением клиентами, выдачей подписок, платежами, интеграцией с Telegram и мониторингом.

> Краткое название: **XSS** · Репозиторий: `XreyStudioServer` · Текущая версия: **v2.1.0**

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
- Multi-tenant организации и white-label брендирование.
- Аудит действий, резервное копирование и восстановление.
- Платежи, тарифы, триалы, рефералы и реселлеры (расширяемо).
- Уведомления через Telegram, webhook, SMTP email и Signal (`signal-cli-rest-api`).
- Обновлённый тёмный SaaS-интерфейс (v1.6.0): сайдбар, быстрый поиск по страницам, модальные формы,
  анимации, светлая тема, полные переводы RU/EN и мобильная адаптивность.
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

```bash
git clone https://github.com/HakunaMaruna/XreyStudioServer.git
cd XreyStudioServer
cp .env.example .env
./install.sh all-in-one your-domain.com
```

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

Опционально: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_URL`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`/`ALERT_EMAIL_TO`, `SIGNAL_API_URL`/`SIGNAL_PHONE_NUMBER`/`SIGNAL_RECIPIENT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (обязателен для Stripe-вебхуков), `METRICS_TOKEN`, `REDIS_URL` (общий rate limiting; при отсутствии — память), `THROTTLE_TTL`, `THROTTLE_LIMIT`, `GRAFANA_PASSWORD`, `BACKUP_DIR`, `BACKUP_KEEP`, `PASSWORD_HASHER` (`argon2id` по умолчанию, `bcrypt` для новых хешей), `ALERT_WEBHOOK_TOKEN` (общий секрет для алертов Grafana), `AGENT_CA`/`AGENT_CERT`/`AGENT_KEY` (mTLS с агентами), `SINGBOX_CONFIG_PATH`/`SINGBOX_BIN`/`SINGBOX_SERVICE` (не-Xray протоколы), `XRAY_LOG_PATH`/`SINGBOX_LOG_PATH` (резервный источник логов агента, если нет `journalctl`).

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

MIT
