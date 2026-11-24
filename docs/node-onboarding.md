# Онбординг ноды XreyStudioServer

Нода — отдельный сервер с агентом, который держит Xray и обменивается с панелью
по `PANEL_URL`. Панель знает ноду по `NODE_ID`, агент авторизуется `AGENT_TOKEN`.

## Что нужно заранее

- на ноде: Linux, `git`, `docker` + `docker compose v2`, открытые порты под Xray;
- DNS-имя ноды (если нужны TLS/подписки);
- доступ к панели с ролью ADMIN или OPERATOR;
- для SSH-способа — SSH-ключ или ssh-agent (скрипт работает в `BatchMode=yes`);
- для `scripts/add-node.sh` — `jq` **или** `python3`: ими скрипт разбирает JSON-ответы
  панели (`POST /api/nodes`, `POST /api/nodes/register`, `GET /api/nodes/:id/health`).
  Без одного из них он не прочитает `id`/`agentToken` и статус ноды и остановится
  с ошибкой ещё до установки (в `--dry-run` проверка не мешает — там разбора нет).

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

## Ограничения песочницы

В средах без SSH/helm скрипт проверяется только в `--dry-run`, а `helm lint`
запускается там, где helm установлен. Результат, который не был получен,
не считается проверенным.
