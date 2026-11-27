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
    id: 'cli',
    title: 'Терминальное меню xss',
    icon: 'server',
    markdown: `# Терминальное меню xss

После установки в режимах \`panel\`, \`all-in-one\` и \`control\` установщик создаёт ссылку \`/usr/local/bin/xss\`. Она указывает на \`scripts/xss\` в каталоге установки, поэтому \`git pull\` обновляет команду без переустановки.

\`\`\`bash
xss start
\`\`\`

Меню работает по SSH и в локальной консоли, использует обычные ANSI-цвета и \`read\`; \`whiptail\`, \`dialog\` и \`gum\` не нужны. Если панель была установлена до появления команды, создайте ссылку вручную:

\`\`\`bash
sudo ln -sfn /opt/XreyStudioServer/scripts/xss /usr/local/bin/xss
\`\`\`

## Команды

| Команда | Действие |
| --- | --- |
| \`xss start\` / \`xss menu\` | интерактивное меню |
| \`xss snapshots\` / \`xss list\` | снимки: дата/время UTC, событие, размер, файл |
| \`xss backup\` | создать снимок (\`--event\`, \`--note\`) |
| \`xss restore [NAME]\` | восстановить снимок; без имени — выбрать из списка |
| \`xss status\` | версия, число снимков и \`docker compose ps\` |
| \`xss update\` | страховочный снимок, \`git pull --ff-only\`, пересборка и запуск |
| \`xss reinstall\` | пересобрать образы и пересоздать контейнеры |
| \`xss restart\`, \`xss up\`, \`xss stop\` | управление сервисами |
| \`xss logs [SERVICE]\` | последние 200 строк логов |
| \`xss version\`, \`xss help\` | версия и справка |

## Снимки и события

Снимки лежат в \`BACKUP_DIR\` (по умолчанию \`backups/\`). Для каждого файла рядом хранится \`.meta\` с событием: \`manual\`, \`scheduled\`, \`pre-update\`, \`pre-restore\`, \`pre-reinstall\`. Старые снимки без \`.meta\` показываются как «неизвестно».

\`xss backup\` и автоматические страховочные снимки используют \`BACKUP_KEEP\` (по умолчанию 7). Ротация удаляет и сам снимок, и его \`.meta\`.

## Восстановление

\`xss restore\` сначала просит ввести \`yes\`, затем:

1. расшифровывает и проверяет выбранный снимок;
2. создаёт страховочный снимок \`pre-restore\`;
3. импортирует дамп во временную БД \`xss_restore_*\`;
4. останавливает backend и frontend, переименовывает рабочую БД в \`xss_prev_*\`, а временную — в рабочую;
5. запускает панель и удаляет старую БД.

Если импорт или запуск не удался, рабочая БД не заменяется (или остаётся под именем \`xss_prev_*\`). Docker-тома не удаляются. Восстановление из старого снимка не удаляет сам файл: \`pre-restore\` создаётся с запасом хранения.

## Шифрование

Если в \`.env\` задан \`BACKUP_ENCRYPTION_KEY\`, \`xss\` шифрует снимки через backend AES-256-GCM и сохраняет только \`.sql.gz.enc\`. Без ключа создаётся обычный \`.sql.gz\`.

Для шифрования нужны сервис \`backend\` и каталог \`backups\`, смонтированный в \`/app/backups\`. Если это не так, команда завершится ошибкой и удалит временный plaintext-дамп — незашифрованный снимок молча не появится. \`make backup\` и \`scripts/backup.sh\` по-прежнему создают plaintext; для шифрованных снимков и S3-копий используйте \`xss backup\` или страницу **Резервные копии**.

## Обновление и переустановка

\`xss update\` отказывается работать при незакоммиченных изменениях, делает \`pre-update\` снимок, выполняет \`git pull --ff-only\`, затем \`docker compose build\` и \`up -d\`.

\`xss reinstall\` пересобирает образы и пересоздаёт контейнеры (\`--force-recreate\`), но не удаляет тома, \`.env\` и \`backups/\` — база сохраняется.

## Если что-то не работает

- \`xss: command not found\` — перезапустите \`install.sh\` или создайте ссылку вручную (см. выше).
- Меню не открывается — нужен TTY и доступный Docker Compose; проверьте \`docker compose version\`.
- Не создаётся шифрованный снимок — проверьте \`BACKUP_ENCRYPTION_KEY\`, \`BACKUP_DIR=backups\` и сервис \`backend\`.
- Не запускается панель после restore — старая БД сохранена как \`xss_prev_*\`; смотрите \`xss logs backend\`.

Полная версия для GitHub — в [каталоге docs](https://github.com/HakunaMaruna/XreyStudioServer/tree/main/docs): файл \`cli.md\`.
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
  {
    id: 'external-links',
    title: 'Внешние ссылки и подписки',
    icon: 'globe',
    markdown: `# Внешние ссылки и подписки пользователя

Пользователь может добавить к **своей** подписке чужие share-ссылки и подписку провайдера. Данные хранятся отдельно и отдаются только в подписке этого пользователя.

## Где добавить в UI

**Пользователи** → карточка пользователя → окно подключения → блок **«Внешние ссылки и подписки»**. Там же видны тип (\`link\` / \`subscription\`), заметка, статус и ошибка последней загрузки.

## API

\`\`\`text
GET    /api/users/:id/external-links
POST   /api/users/:id/external-links
DELETE /api/users/:id/external-links/:linkId
\`\`\`

\`\`\`bash
curl -X POST https://panel.example.com/api/users/<id>/external-links \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\
  -d '{"kind":"link","value":"vless://uuid@host:443?security=tls#запасной","remark":"Мой канал"}'

curl -X POST https://panel.example.com/api/users/<id>/external-links \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\
  -d '{"kind":"subscription","value":"https://provider.example.com/sub/token","remark":"Провайдер"}'
\`\`\`

Поля: \`kind\` (\`link\` по умолчанию или \`subscription\`), \`value\` (обязательно, до 8192 символов), \`remark\`, \`enabled\` (по умолчанию \`true\`). Порядок определяется \`sortIndex\` — новые записи добавляются в конец.

## Поддерживаемые ссылки

Обычная ссылка — одна строка с схемой: \`vless://\`, \`vmess://\`, \`trojan://\`, \`ss://\`, \`hysteria2://\` (\`hy2://\`), \`tuic://\`, \`wireguard://\` (\`wg://\`), а также \`ssr://\`, \`hysteria://\`, \`socks://\`/\`socks5://\`. Неизвестная схема отклоняется. Отключённая запись (\`enabled: false\`) в подписку не попадает.

Удалённая подписка — URL \`http(s)://\`, который панель загружает **на стороне сервера**:

- ответ до **2 MiB** и не более **1000 ссылок**;
- поддерживается plain-текст (по строкам) и base64-тело без \`://\`; комментарии \`#...\` и строки с неподдерживаемыми схемами отбрасываются;
- кэш в памяти на **5 минут** (до 256 URL), поэтому повторные обновления подписки не бьют по провайдеру;
- редиректы обходятся вручную (до 4 прыжков), таймаут 6 секунд;
- **SSRF-защита**: отклоняются \`localhost\`, \`metadata.google.internal\`, loopback/private/link-local CIDR, IPv6 \`fe80/fc/fd\`, а также домены, которые резолвятся в приватный адрес. Каждый редирект проверяется по тем же правилам.

## Как попадает в подписку

External-ссылки дописываются после собственных линков и цепочек: \`raw\` — строками, \`base64\` — кодируется вместе со всей подпиской, \`json\` — элементами с \`id\` и \`tag\` вида \`external-0\`, \`external-1\`, полем \`link\` и схемой из префикса.

## Ошибки

Если загрузка удалённой подписки не удалась, ссылки этой записи пропускаются, а причина пишется в \`lastFetchError\` (и \`lastFetchAt\`). Текст ошибки показывается прямо в карточке в UI — например, \`Subscription responded 503\` или \`Subscription body is too large\`. Ошибка не ломает всю подписку: остальные записи и собственные линки продолжают отдаваться.
`,
  },
  {
    id: 'notifications-via-node',
    title: 'Уведомления через ноду',
    icon: 'activity',
    markdown: `# Отправка уведомлений через ноду

Если панель стоит на хосте, до которого провайдеры уведомлений недоступны (например, блокируемый RU-хост), HTTP-запросы можно выпустить **с ноды**.

## Где включить

**Настройки → Уведомления** → выпадающий список **«Отправлять через ноду»**. По умолчанию выбран пункт **«Напрямую с панели»** — поведение не меняется. Выберите ноду из списка, и выбор сохранится:

\`\`\`bash
# включить ретрансляцию через ноду
curl -X PATCH https://panel.example.com/api/notifications/relay-node \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\
  -d '{"nodeId":"<id ноды>"}'

# вернуться в прямой режим
curl -X PATCH https://panel.example.com/api/notifications/relay-node \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\
  -d '{"nodeId":null}'
\`\`\`

Настройка хранится как \`NOTIFICATION_VIA_NODE_ID\`.

## Что именно идёт через ноду

- **Telegram** (\`api.telegram.org\`) и **Signal** (HTTP API) — \`POST\` с ноды;
- **Webhook** — \`POST\` с ноды, включая подпись \`X-XSS-Signature: sha256=...\` при заданном \`WEBHOOK_SECRET\`;
- **SMTP (email)** — всегда отправляется **напрямую с панели** через \`SMTP_HOST\`/\`SMTP_PORT\`, ретрансляция его не затрагивает.

Технически панель открывает SSH-соединение к выбранной ноде и делает \`forwardOut\` к API провайдера, затем выполняет обычный HTTP/HTTPS-запрос через этот сокет (SNI выставляется по имени хоста, таймаут 8 секунд). Если у ноды задан **jump node** (\`jumpNodeId\`), сначала строится цепочка: панель → jump-нода → целевая нода → провайдер.

## Требования и подводные камни

- у ноды должны быть сохранённые SSH-учётные данные (пароль или приватный ключ, при необходимости с passphrase) — иначе отправка вернёт ошибку;
- при настроенном jump node должны быть данные и у jump-ноды, иначе цепочка не соберётся;
- webhook в проде требует \`https://\` и запрещает приватные адреса; редиректы не разворачиваются — адрес провайдера не может быть подменён на локальный;
- если запрос через ноду не удался, причина попадает в результат канала и в историю **Оповещений**; проверять каналы можно кнопками проверки в том же разделе.

Режим «через ноду» полезен только для доступа к провайдеру уведомлений: он не меняет маршрутизацию трафика подписок и не делает ноду SMTP-сервером.
`,
  },
  {
    id: 'balancer-recipes',
    title: 'Балансировщики: рецепты',
    icon: 'route',
    markdown: `# Балансировщики: готовые рецепты

Раздел **Балансировщики** — редактор \`routing.balancers\` Xray. Доступен ADMIN и OPERATOR (OPERATOR видит только свою организацию). Формы и поля описаны в \`docs/balancers.md\`; ниже — готовые JSON-тела для \`POST /api/balancers\` (\`PATCH\` принимает те же поля).

## Общая форма payload

\`\`\`text
name              имя (до 120 символов)
strategy          random | roundRobin | leastPing | leastLoad
enabled           включать ли балансировщик в конфиг (обязательно true для работы)
fallbackTag       тег outbound'а при отказе участников (по умолчанию direct)
rule              объект с matchers: domain, ip, port, network, inboundTag, protocol, source, user (+ ruleTag)
members           от 1 до 32 участников
probeUrl          URL проверки (http/https), по умолчанию https://www.google.com/generate_204
probeIntervalSec  10..3600, секунды
observatoryMode   observatory | burstObservatory
burstDestination, burstIntervalSec (10..3600), burstSampling (1..50), burstTimeoutSec (1..60) — для burst
organizationId    опционально, организация
\`\`\`

Поля участника: \`protocol\` (\`vless\`, \`vmess\`, \`trojan\`, \`shadowsocks\`, \`freedom\`, \`socks\`, \`http\`), \`address\`, \`port\`, \`uuid\`, \`password\`, \`method\`, \`security\` (\`none|tls|reality\`), \`transport\`, \`sni\`, \`path\`, \`enabled\`. Секреты шифруются в БД ключом \`PANEL_MASTER_KEY\` и расшифровываются только при генерации конфига. Теги участников генерируются автоматически: \`bal-<id>-out-1\`, \`bal-<id>-out-2\`, ...; тег балансировщика — \`balancer-<id>\`.

## Рецепт 1. Round-robin на два исходящих

\`\`\`json
{
  "name": "RR — два канала",
  "strategy": "roundRobin",
  "enabled": true,
  "fallbackTag": "direct",
  "rule": { "domain": ["example.com", "geosite:google"] },
  "members": [
    { "protocol": "vless", "address": "a.example.com", "port": 443, "uuid": "11111111-1111-1111-1111-111111111111", "security": "tls", "sni": "a.example.com", "transport": "tcp", "enabled": true },
    { "protocol": "trojan", "address": "b.example.com", "port": 443, "password": "secret-b", "security": "tls", "sni": "b.example.com", "enabled": true }
  ]
}
\`\`\`

**Когда использовать:** два примерно равнозначных канала, нужно равномерно размазать нагрузку и не заботиться о проверках доступности (\`roundRobin\` работает без observatory).

**Что крутить:** \`rule.domain\` / \`rule.ip\` / \`rule.port\` / \`rule.network\` — какие потоки балансировать; \`members\` — адреса, порты и учётные данные; \`fallbackTag\` — куда уйти, если оба участника недоступны.

## Рецепт 2. Failover: primary + backup с observatory

\`\`\`json
{
  "name": "Failover — primary + backup",
  "strategy": "leastPing",
  "observatoryMode": "observatory",
  "probeUrl": "https://www.google.com/generate_204",
  "probeIntervalSec": 30,
  "enabled": true,
  "fallbackTag": "direct",
  "rule": { "domain": ["critical.example.com"] },
  "members": [
    { "protocol": "vless", "address": "primary.example.com", "port": 443, "uuid": "22222222-2222-2222-2222-222222222222", "security": "tls", "sni": "primary.example.com", "enabled": true },
    { "protocol": "vmess", "address": "backup.example.com", "port": 443, "uuid": "33333333-3333-3333-3333-333333333333", "security": "tls", "sni": "backup.example.com", "enabled": true }
  ]
}
\`\`\`

**Когда использовать:** есть основной и резервный каналы; при росте задержки/отказе основного трафик уходит на запасной.

**Что крутить:** \`probeUrl\` и \`probeIntervalSec\` — проверка должна быть доступна через оба участника; \`observatoryMode: "burstObservatory"\` с полями \`burstDestination\`, \`burstIntervalSec\`, \`burstSampling\`, \`burstTimeoutSec\` — менее заметные и более частые пробы, быстрее находят отказ; \`fallbackTag\`. Ограничение MVP: явного приоритета/весов нет, выбор идёт по измеренной задержке, поэтому «строго primary» гарантии нет — для критичных случаев делайте отдельное правило.

## Рецепт 3. Группа least-latency / url-test

\`\`\`json
{
  "name": "URL-test — пул из трёх",
  "strategy": "leastPing",
  "observatoryMode": "burstObservatory",
  "burstDestination": "https://connectivitycheck.gstatic.com/generate_204",
  "burstIntervalSec": 60,
  "burstSampling": 10,
  "burstTimeoutSec": 5,
  "probeUrl": "https://www.google.com/generate_204",
  "probeIntervalSec": 30,
  "enabled": true,
  "fallbackTag": "direct",
  "rule": { "ip": ["0.0.0.0/0"], "network": "tcp" },
  "members": [
    { "protocol": "vless", "address": "n1.example.com", "port": 443, "uuid": "44444444-4444-4444-4444-444444444444", "security": "tls", "sni": "n1.example.com", "enabled": true },
    { "protocol": "vmess", "address": "n2.example.com", "port": 443, "uuid": "55555555-5555-5555-5555-555555555555", "enabled": true },
    { "protocol": "shadowsocks", "address": "n3.example.com", "port": 8388, "method": "aes-256-gcm", "password": "secret-ss", "enabled": true }
  ]
}
\`\`\`

**Когда использовать:** пул из трёх и более нод, нужно автоматически выбирать самую быструю (\`leastPing\`) или Least Load; аналог «url-test» в клиентах.

**Что крутить:** \`strategy\` (\`leastPing\` / \`leastLoad\`), \`burstDestination\` и интервалы проб, \`rule\` (например, сузить \`ip\` до нужных сетей), список \`members\`. Если хотя бы один включённый балансировщик использует burst, в конфиг пишется только \`burstObservatory\` с объединённым \`subjectSelector\` — обычный \`observatory\` при этом не добавляется.

## Рецепт 4. Сбалансированная цепочка с тегом \`extern\`

\`\`\`json
{
  "name": "Chain — balanced → extern",
  "strategy": "roundRobin",
  "enabled": true,
  "fallbackTag": "extern",
  "rule": { "inboundTag": ["test-in"], "network": "tcp", "ruleTag": "extern-chain" },
  "members": [
    { "protocol": "vless", "address": "hop1.example.com", "port": 443, "uuid": "66666666-6666-6666-6666-666666666666", "security": "tls", "sni": "hop1.example.com", "enabled": true },
    { "protocol": "vless", "address": "hop2.example.com", "port": 443, "uuid": "77777777-7777-7777-7777-777777777777", "security": "tls", "sni": "hop2.example.com", "enabled": true }
  ]
}
\`\`\`

**Когда использовать:** трафик с конкретного inbound'а (\`inboundTag\`) балансируется между хопами, а при отказе всех участников уходит в уже существующую цепочку/upstream с тегом \`extern\`.

**Что крутить:** \`rule.inboundTag\` — тег исходного inbound'а; \`ruleTag\` — подпись правила; \`fallbackTag\` — имя исходящего тега; \`members\`. Важно: тег \`extern\` должен существовать в конфиге как outbound — добавьте его кастомным routing profile (**Инфраструктура → Профили маршрутизации**) в массиве \`outbounds\`, например:

\`\`\`json
{
  "outbounds": [
    {
      "tag": "extern",
      "protocol": "vless",
      "settings": { "address": "upstream.example.com", "port": 443, "clients": [{ "id": "88888888-8888-8888-8888-888888888888" }], "decryption": "none" },
      "streamSettings": { "network": "raw", "security": "tls", "tlsSettings": { "serverName": "upstream.example.com" } }
    }
  ]
}
\`\`\`

Выпадающий список \`fallbackTag\` в UI содержит только \`direct\` и \`blocked\`; произвольное значение (\`extern\`) задаётся через API: \`PATCH /api/balancers/<id>\` с \`{"fallbackTag":"extern"}\`. DTO допускает любую строку до 80 символов, но не проверяет существование тега — несуществующий \`fallbackTag\` приведёт к ошибке Xray при запуске конфига.

## Как сделать тестовый балансировщик

1. На тестовой ноде поднимите два тестовых подключения/outbound'а (например, два VLESS-инбаунда на разных портах) и запомните их адрес, порт и UUID — это будут два участника. Убедитесь, что нода онлайн и конфиг применён.
2. Создайте балансировщик через UI или API (рецепт 1), указав эти два адреса в \`members\` и \`enabled: true\`. Без \`enabled: true\` он не попадёт в генерируемый конфиг.
3. На странице ноды нажмите **«Применить»** — иначе нода останется на старой ревизии конфига. Кнопка **«Предпросмотр конфига»** в редакторе показывает точный JSON (\`outbounds\`, \`balancers\`, \`rules\`, \`observatory\`), который уйдёт в Xray: теги должны быть \`bal-<id>-out-1/2\` и \`balancer-<id>\`.
4. Проверьте CRUD и статус:

\`\`\`bash
curl -sS https://panel.example.com/api/balancers -H 'Authorization: Bearer <token>'
curl -sS https://panel.example.com/api/balancers/<id> -H 'Authorization: Bearer <token>'
curl -sS -X POST https://panel.example.com/api/balancers/<id>/preview \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{}'
curl -sS -X PATCH https://panel.example.com/api/balancers/<id> \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"enabled":true}'
curl -sS -X DELETE https://panel.example.com/api/balancers/<id> -H 'Authorization: Bearer <token>'
\`\`\`

Статус: в списке должен быть \`enabled: true\`, предпросмотр — непустые \`outbounds\`/\`balancers\`/\`rules\`, на ноде — выросшая ревизия конфига и зелёный статус применённого конфига. Клиент подписки, подключённый к inbound'у из \`rule\`, должен ходить через этот балансировщик. После \`DELETE\` снова нажмите **«Применить»**, чтобы убрать balancer из рабочего конфига.

Ограничения: веса участников и тонкие настройки \`strategy.settings\` пока не поддерживаются; общий observatory/burstObservatory один на все балансировщики; sing-box и внешние протоколы (Hysteria2/TUIC/WireGuard) этим механизмом не балансируются.
`,
  },
];
