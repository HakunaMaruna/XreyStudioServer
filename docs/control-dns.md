# CONTROL: зона нод и PowerDNS

Центральная панель (**CONTROL**) владеет зоной `node.h2onetwork.pro` и выдаёт домены нодам.
Клиентские панели (**TENANT**) DNS не запускают: они запрашивают домен у CONTROL по HTTPS
с `X-API-Token` и затем создают VLESS TLS-подключение.

## Установка CONTROL

```bash
git clone https://github.com/HakunaMaruna/XreyStudioServer.git
cd XreyStudioServer
./install.sh --mode control --domain msc.h2onetwork.pro --lang ru
```

Режим `control` поднимает `docker-compose.control.yml`: обычные сервисы панели **плюс**
`powerdns` (UDP/TCP 53 наружу, HTTP API 8081 только внутри Docker-сети).
Установщик генерирует `PDNS_API_KEY` и `PANEL_MASTER_KEY` и пишет их в `.env`.
Для smoke-теста на сервере, где `systemd-resolved` занимает `127.0.0.53:53`,
установите `PDNS_BIND_IP=127.0.0.1` — PowerDNS слушает только локальный адрес,
а после включения публичного DNS замените на `0.0.0.0`.

Инициализация SQLite-базы PowerDNS и зоны (один раз):

```bash
bash scripts/init-pdns-sqlite.sh
sudo docker compose -f docker-compose.control.yml restart powerdns
```

Создание зоны (один раз):

```bash
bash scripts/bootstrap-dns-zone.sh --dry-run   # проверка запроса
PDNS_API_KEY=$(grep '^PDNS_API_KEY=' .env | cut -d= -f2-) \
  bash scripts/bootstrap-dns-zone.sh
docker compose -f docker-compose.control.yml exec -T backend \
  sh -c 'dig @127.0.0.1 node.h2onetwork.pro SOA +short'
```

## Делегирование у регистратора `h2onetwork.pro`

```text
node.h2onetwork.pro.   NS   ns1.h2onetwork.pro.
node.h2onetwork.pro.   NS   ns2.h2onetwork.pro.
ns1.h2onetwork.pro.    A    <IP_CONTROL>
ns2.h2onetwork.pro.    A    <IP_CONTROL>
```

- Glue-записи `ns1/ns2` обязательны: NS находятся внутри делегируемой зоны.
- Не добавляйте `*.node.h2onetwork.pro` в родительскую зону — это конфликт с делегированием.
- На CONTROL-сервере открыть UDP **и** TCP 53. Если `systemd-resolved` слушает `0.0.0.0:53`,
  отключите `DNSStubListener=yes` и перезапустите службу.
- Проверка извне: `dig node.h2onetwork.pro SOA +short`, `dig test.node.h2onetwork.pro A +short`.

## API CONTROL

Требуется API-токен со scope `NODE_DOMAIN` (создаётся администратором в `/api-tokens`,
raw-значение показывается один раз, хранится только хешем, квота безлимитная).

```bash
curl -X POST https://<control>/api/control/domains \
  -H 'X-API-Token: xss_...' -H 'Content-Type: application/json' \
  -d '{"ipv4":"203.0.113.10","ipv6":null,"location":"RU","nodeName":"msk-01"}'
# → {"label":"xwesyf54fdd","fqdn":"xwesyf54fdd.node.h2onetwork.pro", ...}

curl https://<control>/api/control/domains -H 'X-API-Token: xss_...'
curl -X DELETE https://<control>/api/control/domains/<id> -H 'X-API-Token: xss_...'
```

Записи A/AAAA создаются с TTL 60. При удалении ноды мастер вызывает `DELETE`,
DOMAIN помечается `releasedAt` и DNS-записи удаляются.

## Сертификаты (DNS-01)

```bash
curl -X POST https://<control>/api/control/certificates \
  -H 'X-API-Token: xss_...' -H 'Content-Type: application/json' \
  -d '{"domainId":"<id>"}'
```

Certbot получает TXT `_acme-challenge.<label>.node.h2onetwork.pro` через PowerDNS API.
Используется **VLESS + TLS**, не Reality: сертификат нужен для выданного FQDN.

Если пользователь указал свой домен, он должен быть CNAME на выданный домен,
а запись ACME — CNAME в нашу зону:

```text
vpn.example.com.                  CNAME  xwesyf54fdd.node.h2onetwork.pro.
_acme-challenge.vpn.example.com.  CNAME  _acme-challenge.xwesyf54fdd.node.h2onetwork.pro.
```

Тогда один сертификат выпускается сразу на оба имени (`-d fqdn -d userDomain`).
Без этих записей мастер создаст ноду, но вернёт `certificateIssued: false` —
повторите выпуск командой `/api/wizard/certificates/retry` после настройки DNS.

## TENANT

На клиентской панели DNS-контейнера нет. В `.env` задаются:

```text
CONTROL_API_URL=https://msc.h2onetwork.pro
CONTROL_TENANT_TOKEN=xss_...
PANEL_MASTER_KEY=<base64-32-bytes>
SSH_PROVISION_ENABLED=true
```

`PANEL_MASTER_KEY` шифрует сохранённые SSH-пароли/ключи (AES-256-GCM); секреты
никогда не возвращаются API и не пишутся в логи. При отсутствии токена CONTROL
мастер работает в локальном режиме (домен не выдаётся).
