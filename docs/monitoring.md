# Monitoring and alerting

Start the optional stack with `make monitoring`:

- Prometheus: `http://localhost:9091`
- Grafana: `http://localhost:3002` (password from `GRAFANA_PASSWORD`)

Grafana provisions the Prometheus datasource, the `XreyStudioServer — Overview` dashboard and
alerting resources from `monitoring/grafana/provisioning/`.

## Alert rules

| Rule | Condition | Severity |
|---|---|---|
| `xss-backend-down` | Prometheus cannot scrape the backend for 1 minute | critical |
| `xss-node-offline` | Registered nodes exceed online nodes for 2 minutes | critical |
| `xss-backend-memory` | Backend RSS above 512 MiB for 5 minutes | warning |
| `xss-node-cpu-high` | Node CPU above 85% for 5 minutes | warning |

## Alert delivery

The provisioned contact point posts to `http://backend:3000/api/notifications/alerts` with
`Authorization: Bearer $ALERT_WEBHOOK_TOKEN`. The backend validates the token with a constant-time
comparison, stores every alert in the `AlertHistory` table and broadcasts a formatted message
through `NotificationsService`. Available channels:

| Channel | Required variables | Notes |
|---|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | HTML formatted message |
| Webhook | `WEBHOOK_URL` | generic JSON, also used for node/payment events |
| Email | `SMTP_HOST`, `EMAIL_FROM` (optionally `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`), `ALERT_EMAIL_TO` | plain text via SMTP |
| Signal | `SIGNAL_API_URL`, `SIGNAL_PHONE_NUMBER`, `SIGNAL_RECIPIENT` | `signal-cli-rest-api` `/v2/send` |

Unconfigured channels are skipped; the response reports the result per channel. Alerts can be
reviewed in the panel on the **Alerts** page (`/alerts`), which also shows which channels are
configured (`GET /api/notifications/channels`).

Setup:

1. Set `ALERT_WEBHOOK_TOKEN` in `.env` to a long random value (the same value is passed to
   Grafana by `docker-compose.yml`).
2. Configure at least one delivery channel from the table above (Telegram is optional).
3. Restart the stack: `docker compose --profile monitoring up -d`.

If the token is missing, the endpoint responds `503`; a wrong token responds `401`. Alert rules
cannot be edited in the Grafana UI because they are file-provisioned — change the YAML and
restart Grafana.

To verify manually:

```bash
curl -X POST http://localhost:3000/api/notifications/alerts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" \
  -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"smoke test"}}]}'
```

## Custom scrape headers

If `METRICS_TOKEN` is set, add the header to the scrape job in
`monitoring/prometheus/prometheus.yml`:

```yaml
  - job_name: xss-backend
    metrics_path: /api/metrics
    headers:
      X-Metrics-Token: <same value as METRICS_TOKEN>
    static_configs:
      - targets: ["backend:3000"]
```

## Kubernetes monitoring

Prometheus and Grafana are also shipped for Kubernetes in `k8s/monitoring.yaml`. Their ConfigMaps
are generated from `monitoring/` with `node k8s/generate-monitoring.mjs` (or `make k8s-monitoring`)
and included in `kustomization.yaml`. The Grafana password and alert webhook token come from the
`xss-secrets` Secret instead of `.env`. Prometheus scrapes `backend:3000/api/metrics`; if
`METRICS_TOKEN` is set, either leave it empty for the bundled Prometheus or patch the scrape config
and regenerate.

```bash
kubectl -n xss port-forward svc/grafana 3002:3000
kubectl -n xss port-forward svc/prometheus 9091:9090
```

Regenerate the ConfigMaps after changing dashboards or alerts.
