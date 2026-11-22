# Kubernetes deployment

Alternative to Docker Compose. Requires an NGINX Ingress Controller and cert-manager for TLS.

1. Build and publish the images (or load them into your cluster):

```bash
docker build -t xss-backend:1.4.0 ./backend
docker build -t xss-frontend:1.4.0 ./frontend
docker build -t xss-agent:1.4.0 ./agent
# example for kind: kind load docker-image xss-backend:1.4.0 ...
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
- Prometheus and Grafana are included via `monitoring.json` (Prometheus on `:9090`,
  Grafana on `:3000`, both with 10Gi/5Gi PVCs). The provisioning files are generated from
  `monitoring/` — after editing them run `node k8s/generate-monitoring.mjs`.
  Grafana admin password comes from the `GRAFANA_PASSWORD` key of `xss-secrets`.
- `configmap.yaml` sets `PASSWORD_HASHER=argon2id`; `secret.yaml` contains `ALERT_WEBHOOK_TOKEN`
  for the Grafana alert receiver. Replace it when deploying alerting in the cluster.
- Existing databases created with `prisma db push` must be baselined once before using
  migrations: `npx prisma migrate resolve --applied 20261123000000_init`.
