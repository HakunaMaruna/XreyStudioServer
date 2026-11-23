# Поиск неисправностей: метрики и алерты в Kubernetes

## Симптомы

- В Grafana нет данных панели `XreyStudioServer — Overview`, графики пустые.
- `up{job="xss-backend"} == 0` или target `xss-backend` отсутствует в Prometheus.
- Алерт `xss-backend-down` не приходит в backend webhook.
- Grafana открывается только через port-forward, а не через ingress.

## Проверки

```bash
export NAMESPACE=xss
kubectl -n "$NAMESPACE" get pods -l 'app in (backend,prometheus,grafana)' -o wide
kubectl -n "$NAMESPACE" get svc backend prometheus grafana
kubectl -n "$NAMESPACE" get endpoints backend
kubectl -n "$NAMESPACE" get configmap xss-prometheus-config -o jsonpath='{.data.prometheus\.yml}'
kubectl -n "$NAMESPACE" get configmap xss-grafana-provisioning -o jsonpath='{.data.datasource\.yml}'
kubectl -n "$NAMESPACE" get ingress
kubectl -n "$NAMESPACE" logs deploy/backend --tail=100
kubectl -n "$NAMESPACE" logs deploy/prometheus --tail=100
kubectl -n "$NAMESPACE" logs deploy/grafana --tail=100
```

Ожидается: поды `Running` и `Ready`, у сервиса `backend` есть endpoint `10.x.x.x:3000`, в ConfigMap Prometheus есть job `xss-backend` с `metrics_path: /api/metrics`.

## Команды

### 1. Проверка scrape'а

```bash
kubectl -n "$NAMESPACE" port-forward svc/prometheus 9091:9090 &
kubectl -n "$NAMESPACE" port-forward svc/backend 3000:3000 &
curl -fsS http://127.0.0.1:9091/-/ready
curl -fsS 'http://127.0.0.1:9091/api/v1/targets' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.activeTargets.map(t => [t.labels.job, t.health, t.lastError].join(" | ")).join("\n")'
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/metrics
curl -fsS http://127.0.0.1:3000/api/metrics | grep '^xss_users_total'
```

Если `METRICS_TOKEN` задан в секрете, встроенный Prometheus отправляет только стандартные заголовки и получит `403` — либо оставьте `METRICS_TOKEN` пустым, либо добавьте `X-Metrics-Token` в `monitoring/prometheus/prometheus.yml` и перегенерируйте ConfigMap:

```bash
export METRICS_TOKEN=$(kubectl -n "$NAMESPACE" get secret xss-secrets -o jsonpath='{.data.METRICS_TOKEN}' | base64 -d)
curl -sS -o /dev/null -w '%{http_code}\n' -H "X-Metrics-Token: $METRICS_TOKEN" http://127.0.0.1:3000/api/metrics

# после правки monitoring/prometheus/prometheus.yml
cd /opt/XreyStudioServer
node k8s/generate-monitoring.mjs
kubectl -n "$NAMESPACE" apply -k k8s
kubectl -n "$NAMESPACE" rollout restart deploy/prometheus
```

### 2. Проверка Grafana

```bash
kubectl -n "$NAMESPACE" port-forward svc/grafana 3002:3000 &
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/health
curl -fsS http://127.0.0.1:3002/api/datasources \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).map(d => d.name + " " + d.url).join("\n")'
curl -fsS http://127.0.0.1:3002/api/alertmanager/grafana/config/api/v1/alerts \
  | grep -o 'xss-backend-down\|xss-node-offline' | sort -u
```

Проверка provisioned-файлов внутри пода:

```bash
kubectl -n "$NAMESPACE" exec deploy/grafana -- sh -c 'ls -l /etc/grafana/provisioning/datasources /etc/grafana/provisioning/alerting /var/lib/grafana/dashboards'
```

### 3. Проверка доставки алерта в backend

```bash
export ALERT_WEBHOOK_TOKEN=$(kubectl -n "$NAMESPACE" get secret xss-secrets -o jsonpath='{.data.ALERT_WEBHOOK_TOKEN}' | base64 -d)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/notifications/alerts \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" \
  -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"k8s smoke test"}}]}'
```

Коды: `201` — принято и сохранено в `AlertHistory`, `401` — неверный токен, `503` — токен не настроен.

### 4. Если используется Helm-чарт с ServiceMonitor/Prometheus Operator

```bash
kubectl get servicemonitor -A | grep xrey
kubectl get prometheusrule -A | grep xrey
kubectl -n "$NAMESPACE" get servicemonitor xss-xrey-backend -o yaml
kubectl -n "$NAMESPACE" get prometheus -A -o jsonpath='{.items[*].spec.serviceMonitorSelector}'
```

ServiceMonitor подхватывается только при совпадении `serviceMonitorSelector` Prometheus и меток
`monitoring.serviceMonitor.labels` чарта (например, `release: kube-prometheus-stack`). Убедитесь,
что `namespaceSelector.matchNames` включает namespace `$NAMESPACE`.

## Ожидаемый результат

- `/-/ready` Prometheus возвращает `ready for service`, target `xss-backend` имеет `health: up`.
- `curl /api/metrics` возвращает `200` и метрики `xss_*`.
- Grafana видит datasource `Prometheus` (`http://prometheus:9090`) и панель `xss-overview`;правило `xss-backend-down` присутствует.
- Тестовый алерт возвращает `201` и появляется на странице `/alerts`.

## Эскалация

- Target `down` при доступном `/api/metrics` — приложить `kubectl describe pod` Prometheus и вывод `/api/v1/targets`.
- Нет метрик `xss_*` — проверить, что backend поднялся и `/api/metrics` не защищён токеном; приложить первый ответ `curl`.
- Проблема с ingress/cert-manager — приложить `kubectl -n xss describe ingress xss` и события cert-manager; изменения манифестов согласовывать в issue до коммита.
- Подозрение на дефект приложения — отдельный issue с логами и командами воспроизведения.
