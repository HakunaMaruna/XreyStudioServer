// Regenerates k8s/monitoring.json from the shared monitoring/ configuration.
// Run: node k8s/generate-monitoring.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const ns = 'xss';

const configMap = (name, data) => ({
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name, namespace: ns },
  data,
});

const resources = [
  configMap('prometheus-config', {
    'prometheus.yml': read('monitoring/prometheus/prometheus.yml'),
  }),
  configMap('grafana-datasources', {
    'prometheus.yml': read('monitoring/grafana/provisioning/datasources/prometheus.yml'),
  }),
  configMap('grafana-dashboards', {
    'dashboards.yml': read('monitoring/grafana/provisioning/dashboards/dashboards.yml'),
  }),
  configMap('grafana-dashboard-definitions', {
    'xss-overview.json': read('monitoring/grafana/dashboards/xss-overview.json'),
  }),
  configMap('grafana-alerting', {
    'alerts.yml': read('monitoring/grafana/provisioning/alerting/alerts.yml'),
  }),

  {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'prometheus', namespace: ns },
    spec: {
      selector: { app: 'prometheus' },
      ports: [{ name: 'http', port: 9090, targetPort: 9090 }],
    },
  },
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'prometheus', namespace: ns },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'prometheus' } },
      template: {
        metadata: { labels: { app: 'prometheus' } },
        spec: {
          containers: [{
            name: 'prometheus',
            image: 'prom/prometheus:v2.53.0',
            args: ['--config.file=/etc/prometheus/prometheus.yml', '--storage.tsdb.path=/prometheus'],
            ports: [{ containerPort: 9090, name: 'http' }],
            volumeMounts: [
              { name: 'config', mountPath: '/etc/prometheus', readOnly: true },
              { name: 'data', mountPath: '/prometheus' },
            ],
          }],
          volumes: [
            { name: 'config', configMap: { name: 'prometheus-config' } },
            { name: 'data', persistentVolumeClaim: { claimName: 'prometheus-data' } },
          ],
        },
      },
    },
  },
  {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'prometheus-data', namespace: ns },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '10Gi' } },
    },
  },

  {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'grafana', namespace: ns },
    spec: {
      selector: { app: 'grafana' },
      ports: [{ name: 'http', port: 3000, targetPort: 3000 }],
    },
  },
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'grafana', namespace: ns },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'grafana' } },
      template: {
        metadata: { labels: { app: 'grafana' } },
        spec: {
          containers: [{
            name: 'grafana',
            image: 'grafana/grafana:11.2.0',
            ports: [{ containerPort: 3000, name: 'http' }],
            env: [{
              name: 'GF_SECURITY_ADMIN_PASSWORD',
              valueFrom: { secretKeyRef: { name: 'xss-secrets', key: 'GRAFANA_PASSWORD' } },
            }],
            volumeMounts: [
              { name: 'datasources', mountPath: '/etc/grafana/provisioning/datasources', readOnly: true },
              { name: 'dashboards', mountPath: '/etc/grafana/provisioning/dashboards', readOnly: true },
              { name: 'definitions', mountPath: '/var/lib/grafana/dashboards', readOnly: true },
              { name: 'alerting', mountPath: '/etc/grafana/provisioning/alerting', readOnly: true },
              { name: 'data', mountPath: '/var/lib/grafana' },
            ],
          }],
          volumes: [
            { name: 'datasources', configMap: { name: 'grafana-datasources' } },
            { name: 'dashboards', configMap: { name: 'grafana-dashboards' } },
            { name: 'definitions', configMap: { name: 'grafana-dashboard-definitions' } },
            { name: 'alerting', configMap: { name: 'grafana-alerting' } },
            { name: 'data', persistentVolumeClaim: { claimName: 'grafana-data' } },
          ],
        },
      },
    },
  },
  {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'grafana-data', namespace: ns },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '5Gi' } },
    },
  },
];

writeFileSync(join(root, 'k8s/monitoring.json'), `${JSON.stringify(resources, null, 2)}\n`);
console.log(`Wrote ${resources.length} resources to k8s/monitoring.json`);
