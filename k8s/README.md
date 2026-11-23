# Kubernetes deployment

Alternative to Docker Compose. Requires an NGINX Ingress Controller and cert-manager for TLS.

1. Build and publish the images (or load them into your cluster):

```bash
docker build -t xss-backend:1.8.1 ./backend
docker build -t xss-frontend:1.8.1 ./frontend
docker build -t xss-agent:1.8.1 ./agent
# example for kind: kind load docker-image xss-backend:1.8.1 ...
```

2. Replace placeholders in `secret.yaml` (or, preferably, create the secret with `kubectl create
   secret generic xss-secrets -n xss --from-literal=...`) and set `DOMAIN`/`PANEL_URL` in
   `configmap.yaml` and the host in `ingress.yaml`.

3. Apply:

```bash
kubectl apply -k k8s
kubectl -n xss rollout status deployment/backend
```

Notes:
- The backend init container runs `prisma db push` against PostgreSQL before the API starts.
- PostgreSQL uses a `StatefulSet` with a 10Gi PVC; Redis uses `emptyDir` (cache only).
- Run one agent Deployment per Xray node or replace it with a DaemonSet with `hostNetwork: true`
  when agents live on the same hosts as Xray.
- Prometheus and Grafana are included. Regenerate their ConfigMaps from `monitoring/` after any
   dashboard or alert change: `node k8s/generate-monitoring.mjs`, then `kubectl apply -k k8s`.
- Prometheus scrapes `backend:3000/api/metrics`; if `METRICS_TOKEN` is set in `secret.yaml`, either
   leave it empty for the bundled Prometheus or patch `monitoring/prometheus/prometheus.yml` to send
   the `X-Metrics-Token` header and regenerate the ConfigMap.
- Access the UI locally with `kubectl -n xss port-forward svc/grafana 3002:3000` and
   `kubectl -n xss port-forward svc/prometheus 9091:9090`. Grafana alert rules post to
   `http://backend:3000/api/notifications/alerts` using `ALERT_WEBHOOK_TOKEN` from `secret.yaml`.
- `configmap.yaml` sets `PASSWORD_HASHER=argon2id`; `secret.yaml` contains `ALERT_WEBHOOK_TOKEN`
   for the Grafana alert receiver. Replace it when deploying alerting in the cluster.
