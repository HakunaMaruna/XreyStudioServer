export type DocSection = {
  id: string;
  title: string;
  icon: 'file' | 'key' | 'server' | 'shield' | 'database' | 'activity' | 'globe' | 'route';
  markdown: string;
};

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'quickstart',
    title: 'Быстрый старт',
    icon: 'file',
    markdown: `# Быстрый старт

Панель ставится одной командой. Установщик покажет цветное меню, спросит язык (\`en\`/\`ru\`) и режим, сгенерирует секреты и поднимет сервисы.

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/HakunaMaruna/XreyStudioServer/main/install.sh | bash
\`\`\`

## Режимы

| Режим | Что ставится |
| --- | --- |
| \`all-in-one\` | панель + агент + Caddy + PostgreSQL + Redis |
| \`panel\` | только панель |
| \`node\` | агент с Xray (нужны \`NODE_ID\` и \`AGENT_TOKEN\`) |
| \`subscription\` | только страница подписки |

## Неинтерактивно

\`\`\`bash
./install.sh --mode all-in-one --domain example.com --lang ru --yes
./install.sh --mode node --ssh-host 203.0.113.10 --ssh-user root --dry-run
\`\`\`

После установки откройте \`https://<домен>/login\`. Сохраните выведенные учётные данные.

## Обновление

\`\`\`bash
cd /home/user1/xss
git fetch origin && git reset --hard origin/main
sudo docker compose up -d --build backend frontend agent
\`\`\`

Перед обновлением сделайте бэкап: **Настройки → Резервные копии** или \`make backup\`.
`,
  },
  {
    id: 'vpn-test',
    title: 'Тестовое подключение',
    icon: 'key',
    markdown: `# Тестовое подключение

В панели создан тестовый пользователь с активной подпиской. Добавьте ссылку в приложение, чтобы проверить, что VPN действительно работает.

## Подписка

\`\`\`text
https://msc.h2onetwork.pro/sub/2e3897d4-1f8a-4ebc-aba0-3072229d3504
\`\`\`

В подписке два узла:

- **VMess**, TCP, порт **2053** — без TLS, проверен с внешней машины;
- **VLESS + Reality**, TCP, порт **2054** — проверен с сервера; с некоторых сетей TLS на нестандартном порту режется, тогда используйте VMess.

## Как добавить

- **v2rayNG / v2rayN**: Подписка → Импорт подписки → вставить URL → обновить.
- **Shadowrocket**: «+» → тип \`Subscribe\` → URL → выбрать узел.
- **NekoRay**: Подписка → Добавить → URL → обновить.

## Проверка

После подключения откройте \`https://httpbin.org/get\` — поле \`origin\` должно показывать IP сервера \`213.171.30.186\`, а не ваш прямой IP.

Тестового пользователя и подключение можно удалить после проверки в разделах **Пользователи** и **Подключения**.
`,
  },
  {
    id: 'nodes',
    title: 'Ноды и агенты',
    icon: 'server',
    markdown: `# Ноды и агенты

Агент получает конфигурацию из панели и запускает **Xray** внутри контейнера (managed-режим, без systemd). Статус ноды и версию конфига видно в разделе **Ноды**.

## Добавление ноды по SSH

\`\`\`bash
./scripts/add-node.sh --host 203.0.113.10 --user root \\
  --panel-url https://panel.example.com --admin-token "$PANEL_ADMIN_TOKEN" --dry-run
\`\`\`

Скрипт проверяет доступ, создаёт ноду через \`POST /api/nodes\`, ставит агента и ждёт статус ONLINE. Требуются \`jq\` или \`python3\`.

## Геопроверка

Раз в 6 часов агент определяет исходящий IP через \`GEOCHECK_URL\` и отправляет страну/город/ASN в панель. Результат виден в таблице нод.

## Проверки доступа

Раздел **Проверки доступа** раз в 5 минут подключается к каждому inbound'у «глазами клиента» и показывает задержку. Настраивается переменной \`HEALTH_CHECK_INTERVAL\`.
`,
  },
  {
    id: 'hosts',
    title: 'Хосты и рецепты',
    icon: 'globe',
    markdown: `# Хосты и готовые рецепты

Хост — адрес с портом, SNI и путём. Рецепты автоматически заполняют параметры под протокол и показывают, какую DNS-запись нужно добавить.

## Рецепты

| Рецепт | Порт | SNI / путь |
| --- | --- | --- |
| VLESS Reality | 443 | SNI из Reality-настроек подключения |
| Общий 443 по SNI | 443 | уникальное имя на каждый сервис |
| WS за CDN | 443 | \`cdn.example.com\`, \`/ws\` |
| Hysteria2 UDP | 443/udp | отдельный UDP-порт |
| Trojan TLS | 443 | \`trojan.example.com\` |
| Decoy / fallback | 443 | «чужой» домен-заглушка |

## Создание

**Инфраструктура → Хосты → Новый хост** → выбрать рецепт → указать адрес → сохранить. Рецепт подставит порт, SNI, путь и заметку с подсказкой по DNS.

## Связь с подключением

Кнопка **«Привязать к подключению»** в таблице хостов переносит SNI/путь и публичный адрес в inbound. После этого нажмите **Применить** на ноде — подписка сразу отдаст корректную ссылку.

Подробная инструкция и примеры API — в \`docs/hosts.md\`.
`,
  },
  {
    id: 'rules',
    title: 'Правила и рецепты',
    icon: 'route',
    markdown: `# Правила маршрутизации

Правило решает, куда идёт соединение: \`direct\` (мимо туннеля) или \`blocked\` (blackhole).

## Готовые рецепты

| Рецепт | Условие | Куда |
| --- | --- | --- |
| Реклама | \`geosite:category-ads-all\` | blocked |
| РФ напрямую | \`geosite:category-ru\`, \`geoip:ru\` | direct |
| КНР напрямую | \`geosite:cn\`, \`geoip:cn\` | direct |
| Локальные сети | CIDR RFC1918 | direct |
| 18+ | \`geosite:category-porn\` | blocked |
| Торренты | \`protocol: bittorrent\` | blocked |
| DNS напрямую | порт 53 | direct |

**Инфраструктура → Правила → Новое правило** → выбрать рецепт → **Проверить** → сохранить.

Проверка API: \`POST /api/rules/validate\`. После сохранения нажмите **Применить** на ноде — иначе правило не попадёт в конфиг.

Подробности: \`docs/rules.md\`.
`,
  },
  {
    id: 'api',
    title: 'API',
    icon: 'globe',
    markdown: `# API

Swagger доступен по адресу \`/docs\`, OpenAPI-спецификация — \`/docs-json\`.

## Авторизация

\`\`\`bash
curl -X POST https://msc.h2onetwork.pro/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"admin@example.com","password":"..."}'
\`\`\`

Полученный \`accessToken\` передавайте в заголовке \`Authorization: Bearer <token>\`.

## Основные разделы

- \`/users\` — пользователи, подписки, лимиты, устройства;
- \`/nodes\` — ноды, конфигурации, ревизии, метрики, геоданные;
- \`/inbounds\`, \`/hosts\`, \`/rules\` — подключения и маршрутизация;
- \`/subscriptions/:token\` — подписка в форматах \`raw\`, \`base64\`, \`clash\`, \`singbox\`, \`json\`;
- \`/devices\` — привязка HWID-устройств;
- \`/geodata\`, \`/subscription-templates\`, \`/health-checks\` — справочники и проверки;
- \`/mcp\` — read-only MCP-сервер.

Полное описание — в \`docs/api.md\` репозитория.
`,
  },
  {
    id: 'mcp',
    title: 'MCP для ИИ-агентов',
    icon: 'activity',
    markdown: `# MCP-bridge

Панель предоставляет read-only MCP-сервер по адресу \`POST /api/mcp\` (Streamable HTTP, stateless).

## Авторизация

- заголовок \`X-MCP-Token: <MCP_TOKEN>\` (рекомендуется), или
- \`Authorization: Bearer <MCP_TOKEN>\`, или
- ADMIN JWT.

Без токена — \`401\`. \`MCP_TOKEN\` задаётся в \`.env\`.

## Настройка клиента

\`\`\`json
{
  "mcpServers": {
    "xreystudio": {
      "type": "http",
      "url": "https://msc.h2onetwork.pro/api/mcp",
      "headers": { "X-MCP-Token": "<MCP_TOKEN>" }
    }
  }
}
\`\`\`

## Инструменты

\`panel_status\`, \`list_users\`, \`list_nodes\`, \`health_summary\`, \`list_inbounds\`, \`list_subscription_templates\`, \`geodata_search\`.

Все инструменты только читают данные — изменить что-то через MCP невозможно.
`,
  },
  {
    id: 'security',
    title: 'Безопасность',
    icon: 'shield',
    markdown: `# Безопасность

## Рекомендации

- храните \`.env\` вне git и задайте длинные \`JWT_SECRET\`, \`JWT_REFRESH_SECRET\`, \`ADMIN_PASSWORD\`;
- включите \`METRICS_TOKEN\` — без него метрики в проде не отдаются;
- задайте \`MCP_TOKEN\` для MCP-bridge;
- не открывайте панель напрямую в интернет без TLS и файрвола.

## Что реализовано

- Argon2id для новых паролей, совместимость со старыми хешами;
- RBAC: ADMIN / OPERATOR / USER;
- изоляция подключений и трафика по организациям;
- защита от SSRF при обращении к агентам (блокировка link-local/metadata и IPv6);
- rate limiting через Redis;
- аудит действий администраторов.

Актуальные находки и их статус — в \`security/RE-AUDIT-v2.14.2.md\`.
`,
  },
  {
    id: 'backup',
    title: 'Бэкапы и мониторинг',
    icon: 'database',
    markdown: `# Бэкапы и мониторинг

## Бэкапы

Раздел **Резервные копии** позволяет создавать, скачивать и удалять снимки PostgreSQL. Доступен расписанный режим: интервал, хранение, последний и следующий запуск.

## Метрики

Агент раз в 15 секунд отправляет CPU/RAM/disk/трафик/подключения. Экспорт Prometheus доступен на \`/api/metrics\` с заголовком \`X-Metrics-Token\`.

## Оповещения

Каналы: Telegram / webhook / SMTP / Signal. Проверки доступны в разделе **Оповещения**, история — в **Audit**.

## Geolocation и проверки

См. разделы **Ноды** (геоданные агента) и **Проверки доступа** (client-eye latency).
`,
  },
  {
    id: 'processes',
    title: 'Рабочие процессы',
    icon: 'activity',
    markdown: `# Рабочие процессы

## Установка

1. Подготовьте домен и хост с Docker, скопируйте \`.env.example\` в \`.env\` и задайте секреты.
2. Запустите \`docker compose up -d --build\`, дождитесь миграций Prisma.
3. Проверьте \`curl -fsS https://DOMAIN/api/health\`, войдите в \`/login\`.
4. Добавьте инбаунд и ноду, создайте тестового пользователя с лимитом устройств.
5. Перед продакшеном пройдите чек-лист из \`docs/install.md\` и запустите \`/doctor\`.

## Нода

Токен ноды показывается один раз: backend хранит только его хеш. Агент авторизуется токеном, получает актуальную ревизию конфигурации и сообщает статус. Зеленый индикатор в UI означает, что нода онлайн и применяет конфигурацию.

## Подписка

Пользователь открывает ссылку \`/sub/<token>\`. По User-Agent выбирается формат: sing-box, Clash/Mihomo, base64 для Shadowrocket и других клиентов, либо JSON по умолчанию. Явный параметр \`?format=\` проходит валидацию на backend. HWID устройства связываются через \`/api/devices/bind\`; при достижении \`deviceLimit\` возвращается понятная ошибка 403.

## Бэкап и восстановление

При заданном \`BACKUP_ENCRYPTION_KEY\` снимок шифруется AES-256-GCM до загрузки в S3/R2. Восстановление проверяет тег аутентификации до выполнения SQL. При включенном S3 незашифрованный бэкап запрещен. Полные схемы сценариев — в \`docs/processes.md\`.
`,
  },
  {
    id: 'ui',
    title: 'Интерфейс и безопасность',
    icon: 'shield',
    markdown: `# Интерфейс и безопасность

По умолчанию используется AdminLTE; тема Aurora доступна через \`NEXT_PUBLIC_UI=aurora\`.

## Скрытый вход

При \`PANEL_DECOY=true\` публичный адрес показывает нейтральную страницу. Панель доступна по секретному пути \`/<PANEL_ENTRY_PATH>/login\` или после успешного входа по специальному cookie. Неверно заданный путь отключает вход (fail closed).

## Восстановление доступа

Если администратор потерял доступ, используйте Rescue CLI: \`npm run rescue -- list-admins|reset-password|promote|demote\`. Пароль передается через переменную \`RESCUE_NEW_PASSWORD\` или интерактивный запрос, но не через аргументы командной строки. Последнего активного администратора нельзя понизить.

## Telegram и MCP

Telegram-бот выдает одноразовую подписанную ссылку для входа; секрет webhook передается в заголовке. MCP-инструменты изменения статуса пользователя требуют план и одноразовое одобрение владельца; все шаги попадают в аудит.
`,
  },
  {
    id: 'seo',
    title: 'Публичная документация и SEO',
    icon: 'globe',
    markdown: `# Публичная документация и SEO

Эта страница доступна без авторизации по адресу \`/docs\`. Она отдается сервером, поэтому поисковые системы видят содержимое без выполнения JavaScript.

- \`/robots.txt\` разрешает \`/docs\` и запрещает приватные разделы;
- \`/sitemap.xml\` содержит единственную публичную страницу \`/docs\`;
- канонические ссылки и Open Graph используют \`NEXT_PUBLIC_SITE_URL\`, а не заголовок Host;
- страницы \`/login\`, \`/sub/*\` и дашборды помечены \`noindex\`.

Укажите \`NEXT_PUBLIC_SITE_URL\` равным внешнему адресу панели, например \`https://panel.example.com\`.
`,
  },
];
