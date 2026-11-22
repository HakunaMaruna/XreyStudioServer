# XreyStudioServer (XSS)

Self-hosted панель управления **Xray-core** с агентами нод, управлением клиентами, выдачей подписок, платежами, интеграцией с Telegram и мониторингом.

> Краткое название: **XSS** · Репозиторий: `XreyStudioServer`

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
- Telegram-бот и уведомления (Telegram, email, webhook).
- Тёмная/светлая темы, русский и английский интерфейс, мобильная адаптивность.

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
├── monitoring/              # конфиги Prometheus и дашборды Grafana
├── scripts/                 # скрипты бэкапа и восстановления
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
make monitoring  # запустить Prometheus + Grafana
```

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

Опционально: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (обязателен для Stripe-вебхуков), `METRICS_TOKEN`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `GRAFANA_PASSWORD`, `BACKUP_KEEP`, `AGENT_CA`/`AGENT_CERT`/`AGENT_KEY` (mTLS с агентами).

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

## Безопасность

- HTTPS обязателен (Caddy).
- JWT access + refresh токены.
- Хеширование паролей bcrypt (поддерживается Argon2id).
- Глобальный rate limiting API + отдельные лимиты на логин/refresh.
- Проверка подписи Stripe-вебхуков (HMAC-SHA256, допуск 5 минут).
- Защита от CSRF/XSS/SQL-инъекций/IDOR.
- Шифрование секретов нод в БД.
- mTLS или подписанные токены между панелью и агентом.
- Контейнеры с минимальными привилегиями.
- Аудит без хранения секретов в открытом виде.

## Мониторинг

- Встроенные метрики нод: CPU, RAM, диск, трафик, активные подключения, состояние Xray.
- Health checks и алерты при недоступности нод.
- Prometheus-совместимый endpoint `GET /api/metrics` (при публичном доступе задайте `METRICS_TOKEN` и передавайте заголовок `X-Metrics-Token`).
- Опциональный стек Prometheus + Grafana через `make monitoring`: Prometheus `:9091`, Grafana `:3002` с предустановленным дашбордом `XreyStudioServer — Overview`.

## Бэкап и восстановление

```bash
make backup
make restore FILE=backups/db-20260101-120000.sql.gz
```

Бэкапы — сжатые дампы PostgreSQL в каталоге `backups/`; `BACKUP_KEEP` задаёт число хранимых копий (по умолчанию 7).

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

- `cd backend && npm run typecheck && npm test && npm run build`
- `cd frontend && npm run lint && npm run build`
- Сборка Docker-образов.
- GitHub Actions: `.github/workflows/ci.yml`.

## Планы

- Полный CRUD UI для inbound/hosts/rules.
- UI проверки и отката конфигураций Xray.
- Адаптеры Hysteria2 / TUIC / WireGuard.
- Kubernetes-манифесты.

## Лицензия

MIT
