# XreyStudioServer (XSS) — панель управления Xray

Self-hosted панель управления Xray-core с агентами нод, управлением клиентами, подписками, платежами, Telegram-ботом и мониторингом.

## Стек
- Backend: NestJS (TypeScript), Prisma, PostgreSQL, Redis
- Frontend: Next.js, Tailwind CSS, shadcn/ui
- Агент: Node.js
- Прокси/TLS: Caddy
- Контейнеры: Docker Compose

## Быстрый старт
```bash
cp .env.example .env
make install
```
Режимы: `./install.sh panel|node|subscription|all-in-one domain.com`

## Возможности
- Multi-tenant, RBAC (admin/operator/user)
- Ноды: регистрация, health, метрики, рестарт, применение/откат конфигов
- Пользователи/клиенты, лимиты трафика, срок действия
- Подписки: base64, Clash, sing-box, JSON, raw, QR, инструкции
- Платежи, тарифы, Telegram-бот, алерты
- Аудит, бэкап/восстановление

## Документация API
`/docs` (Swagger)

## Лицензия
MIT