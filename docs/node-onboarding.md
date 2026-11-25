# Онбординг ноды XreyStudioServer

Нода — отдельный сервер с агентом, который держит Xray и обменивается с панелью
по `PANEL_URL`. Панель знает ноду по `NODE_ID`, агент авторизуется `AGENT_TOKEN`.

## Что нужно заранее

- на ноде: Linux, `git`, `docker` + `docker compose v2`, открытые порты под Xray;
- DNS-имя ноды (если нужны TLS/подписки);
- доступ к панели с ролью ADMIN или OPERATOR;
- для SSH-способа — SSH-ключ или ssh-agent (скрипт работает в `BatchMode=yes`).

## Способ 1. Вручную (через панель и терминал)

1. В панели: **Ноды → Добавить**. Заполните имя, адрес, порт (по умолчанию 443).
   Панель покажет `AGENT_TOKEN` **один раз** — сохраните его. `NODE_ID` — это `id`
   ноды из ответа панели (UUID), а не имя хоста.
2. На ноде:

   ```bash
   git clone https://github.com/HakunaMaruna/XreyStudioServer.git /opt/xrey
   cd /opt/xrey
   cp .env.example .env
   # проставьте в .env:
   #   PANEL_URL=https://panel.example.com
   #   NODE_ID=<id ноды из панели>
   #   AGENT_TOKEN=<токен из шага 1>
   docker compose up -d agent
   ```

3. Агент сам вызывает `POST /api/nodes/register` при старте. Проверка:

   ```bash
   curl -fsS http://127.0.0.1:9090/health
   docker compose logs -f agent
   ```

### selfSNI и сайт-заглушка

У Xray нет отдельного ключа `selfSNI`. Дефолтное подключение, которое панель
создаёт при установке ноды, — это `vless + tcp + tls` с `tlsSettings.serverName`,
равным домену ноды, выданному CONTROL DNS (например `abc123.node.h2onetwork.pro`).
Клиент повторяет этот же домен в TLS ClientHello — это и есть «selfSNI».
Домен сначала проверяется через `resolveCname()` на `_acme-challenge.<label>`,
поэтому подключение создаётся только после подтверждения delegated DNS.

Чтобы пассивное сканирование 443-го порта не отличало ноду от обычного сайта,
создаётся fallback на локальный сайт-заглушку:

- `tlsSettings.alpn: ["http/1.1"]` — требование Xray для fallback;
- `fallback: [{ "dest": <NODE_STUB_PORT>, "alpn": "http/1.1" }]` — запросы без
  валидного VLESS-первого пакета уходят на loopback-сервер агента;
- агент слушает заглушку только на `127.0.0.1` (по умолчанию порт `18080`,
  меняется через `NODE_STUB_PORT`), в публичный интерфейс она не выходит.

Отключить заглушку можно через `NODE_STUB_ENABLED=false` в `.env` ноды (например,
если порт 18080 занят другим сервисом).

Альтернатива без клонирования — установщик в режиме `node`:

```bash
PANEL_URL=https://panel.example.com NODE_ID=<id> AGENT_TOKEN=<токен> \
  bash install.sh --mode node --domain https://panel.example.com --yes
```

## Способ 2. По SSH (скрипт `scripts/add-node.sh`)

Скрипт сам создаёт ноду в панели (если дан admin JWT), ставит агент на удалённый
хост и ждёт статус ONLINE.

```bash
# 1. План без изменений
export PANEL_ADMIN_TOKEN='<JWT администратора панели>'
./scripts/add-node.sh --host 203.0.113.10 \
  --panel-url https://panel.example.com --dry-run

# 2. Реальная установка: нода создаётся в панели и ставится на хост
./scripts/add-node.sh --host 203.0.113.10 --user root \
  --panel-url https://panel.example.com --admin-token "$PANEL_ADMIN_TOKEN"

# 3. Нода уже создана вручную — передаём готовую пару
./scripts/add-node.sh --host node1.example.com --user deploy --ssh-port 2222 \
  --panel-url https://panel.example.com \
  --node-id 6f1c9a1e-… --token "$AGENT_TOKEN"
```

Через `install.sh` то же самое:

```bash
./install.sh --mode node --domain https://panel.example.com \
  --ssh-host 203.0.113.10 --ssh-user root --yes
```

Скрипт безопасен при повторном запуске: если каталог `/opt/xrey` уже есть,
делается `git pull --ff-only`, а существующий `.env` не перезаписывается.

### Параметры `scripts/add-node.sh`

| Флаг | Обязателен | По умолчанию | Что делает |
|---|---|---|---|
| `--host` | да | — | IP или DNS-имя ноды |
| `--panel-url` | да | — | URL панели, например `https://panel.example.com` |
| `--user` | нет | `root` | SSH-пользователь |
| `--ssh-port` | нет | `22` | SSH-порт |
| `--node-id` | да* | — | id ноды в БД панели (UUID) |
| `--token` | да* | — | `AGENT_TOKEN` ноды |
| `--admin-token` | да* | `$PANEL_ADMIN_TOKEN` | JWT ADMIN/OPERATOR: создаёт ноду через `POST /api/nodes` |
| `--name` | нет | `node-<host>` | имя ноды в панели |
| `--dir` | нет | `/opt/xrey` | каталог установки на ноде |
| `--repo` | нет | GitHub `main` | git-репозиторий |
| `--wait` | нет | `60` | сколько секунд ждать ONLINE |
| `--dry-run` | нет | выкл | ничего не менять, печатать команды |

\* нужна либо пара `--node-id` + `--token`, либо `--admin-token`.

### Переменные агента

| Переменная | Где | Назначение |
|---|---|---|
| `PANEL_URL` | `.env` / окружение агента | адрес панели |
| `NODE_ID` | `.env` / окружение агента | id ноды в панели |
| `AGENT_TOKEN` | `.env` / окружение агента | секрет ноды (32 байта hex) |
| `AGENT_PORT` | `.env` | порт агента, по умолчанию `9090` |
| `NODE_DOMAIN_SUFFIX` | `.env` панели | суффикс доменов подписок |

## Как проверить, что нода ONLINE

Панель считает ноду онлайн, если `lastSeenAt` моложе 60 секунд.

```bash
# здоровье ноды (JWT ADMIN/OPERATOR)
curl -fsS https://panel.example.com/api/nodes/<node-id>/health \
  -H "Authorization: Bearer $PANEL_ADMIN_TOKEN"
# → {"nodeId":"…","status":"ONLINE","online":true,…}

# список нод
curl -fsS https://panel.example.com/api/nodes \
  -H "Authorization: Bearer $PANEL_ADMIN_TOKEN"
```

Локально на ноде:

```bash
curl -fsS http://127.0.0.1:9090/health
docker compose -f /opt/xrey/docker-compose.yml ps
docker compose -f /opt/xrey/docker-compose.yml logs --tail=100 agent
```

## Health-проверки в Kubernetes

`backend`: readiness `GET /api/health/ready`, liveness и startup — `GET /api/health/live`.
`agent`: readiness и liveness — `GET /health` (порт 9090).
Те же пробы есть в `k8s/*.yaml` и в `helm/xrey/templates/*-deployment.yaml`.

```bash
kubectl -n xss get pods
kubectl -n xss describe pod -l app=agent | sed -n '/Events/,$p'
helm lint ./helm/xrey
```

## Если нода не становится ONLINE

| Симптом | Что проверить |
|---|---|
| `403 Invalid node token` | `AGENT_TOKEN` не совпадает с `tokenHash` ноды; перевыпустите токен (rotate-token) и обновите `.env` |
| `404` / пустой ответ регистрации | `NODE_ID` — id ноды в панели (UUID), а не имя хоста |
| агент жив, статус OFFLINE | `PANEL_URL` доступен с ноды: `curl -fsS $PANEL_URL/api/health` |
| SSH-скрипт падает на `ssh` | нужен ключ или ssh-agent; `BatchMode=yes` пароли не поддерживает |
| `sudo: a password is required` | запустите с `--user root` или настройте `NOPASSWD` для docker |
| долгий первый старт в k8s | `startupProbe` даёт до 2 минут, дальше смотрите `kubectl logs` |

## Canary-роллаут и откат конфигурации

`scripts/rollout.sh` применяет конфигурацию на нодах по одной: сначала canary-группа,
затем health gate, затем остальные. Если canary не проходит health gate, скрипт
вызывает `POST /api/nodes/:id/rollback/:revisionId` и завершается с кодом `3`.

```bash
# 1) репетиция без сети и токена
bash scripts/rollout.sh --nodes NODE_ID_1,NODE_ID_2 --canary 1 --dry-run

# 2) canary-роллаут всех доступных нод с таймаутом health 90 с
ADMIN_TOKEN='<админ-JWT>' bash scripts/rollout.sh --all --canary 1 --wait 90

# 3) применение конкретной ревизии на двух нодах
bash scripts/rollout.sh --nodes NODE_ID_1,NODE_ID_2 \
  --revision-id REVISION_ID --admin-token '<админ-JWT>'
```

| Флаг | Назначение | По умолчанию |
|---|---|---|
| `--nodes <id1,id2,...>` | явный список id нод | — |
| `--all` | взять список из `GET /api/nodes` | — |
| `--canary <N>` | размер canary-группы | `1` |
| `--wait <sec>` | таймаут health gate на ноду | `60` |
| `--revision-id <id>` | ревизия для apply | активная |
| `--admin-token <JWT>` | admin JWT (или `ADMIN_TOKEN`) | — |
| `--dry-run` | только план, без curl | выключен |
| `--help` | справка | — |

Токен передаётся только в заголовке `Authorization: Bearer` и не попадает в логи
(в логах выводится `***`). Для non-dry-run он обязателен: `ADMIN_TOKEN` или флаг
`--admin-token`. `API_URL` по умолчанию `https://msc.h2onetwork.pro/api`.

Коды выхода: `0` — успех, `1` — неверные аргументы, `2` — ошибка API/apply,
`3` — health gate провален (rollback выполнен или попытка сделана).

## Ограничения песочницы

В средах без SSH/helm скрипт проверяется только в `--dry-run`, а `helm lint`
запускается там, где helm установлен. Результат, который не был получен,
не считается проверенным.


## Способ 3. Из UI по SSH

При `SSH_PROVISION_ENABLED=true` администратор может нажать «Установка по SSH» на странице
нод и указать хост, учётные данные и **отпечаток ключа хоста** (`ssh-keygen -lf ...` →
`SHA256:...`). Панель проверяет отпечаток до установки соединения, создаёт ноду, записывает
`.env` с токеном агентом по SFTP (режим 0600) и запускает `install.sh --mode node --yes`.
Токен и ключ не сохраняются в базе и не попадают в логи; токен показывается один раз.
mTLS-сертификаты пока не выдаются — агент использует токен.
