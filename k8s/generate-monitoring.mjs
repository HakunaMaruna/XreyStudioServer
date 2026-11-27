// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sources = {
  'prometheus.yml': 'monitoring/prometheus/prometheus.yml',
  'datasource.yml': 'monitoring/grafana/provisioning/datasources/prometheus.yml',
  'dashboards.yml': 'monitoring/grafana/provisioning/dashboards/dashboards.yml',
  'alerts.yml': 'monitoring/grafana/provisioning/alerting/alerts.yml',
  'xss-overview.json': 'monitoring/grafana/dashboards/xss-overview.json',
};

function configMap(name, keys) {
  const data = Object.entries(keys)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
${data}`;
}

const read = async (relative) => readFile(join(root, relative), 'utf8');

const prometheus = await read(sources['prometheus.yml']);
const provisioning = {};
for (const key of ['datasource.yml', 'dashboards.yml', 'alerts.yml']) {
  provisioning[key] = await read(sources[key]);
}
const dashboard = await read(sources['xss-overview.json']);

const output = [
  configMap('xss-prometheus-config', { 'prometheus.yml': prometheus }),
  configMap('xss-grafana-provisioning', provisioning),
  configMap('xss-grafana-dashboards', { 'xss-overview.json': dashboard }),
].join('\n---\n') + '\n';

await writeFile(join(root, 'k8s', 'monitoring-config.yaml'), output);
console.log('Wrote k8s/monitoring-config.yaml from monitoring/');
