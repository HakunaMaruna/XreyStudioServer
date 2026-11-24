'use strict';

const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://msc.h2onetwork.pro').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || '';
const PANEL_SETTINGS_PATH = process.env.SMOKE_PANEL_SETTINGS_PATH || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const PROTECTED = [
  '/api/inbounds',
  '/api/reports/organizations',
  '/api/nodes',
  '/api/settings',
  '/api/routing',
  '/api/config-profiles',
];

async function call(path, options = {}) {
  const headers = { accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: response.status, data };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}
function skip(name, detail) {
  results.push({ name, skipped: true });
  console.log(`SKIP ${name} (${detail})`);
}

async function main() {
  console.log(`Live smoke: ${BASE_URL}`);

  try {
    const health = await call('/api/health');
    record(
      'health',
      health.status === 200 && health.data?.status === 'ok' && health.data?.db === 'ok',
      `status=${health.status}, db=${health.data?.db || 'unknown'}`,
    );
  } catch (error) {
    record('health', false, error.message);
  }

  for (const path of PROTECTED) {
    try {
      const response = await call(path);
      record(`anonymous ${path} rejected`, response.status === 401 || response.status === 403, `status=${response.status}`);
    } catch (error) {
      record(`anonymous ${path} rejected`, false, error.message);
    }
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    skip('authenticated read checks', 'set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD secrets');
    skip('panel settings read', 'no API path configured and no credentials');
  } else {
    try {
      const login = await call('/api/auth/login', {
        method: 'POST',
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      if (login.status !== 201 || !login.data?.accessToken) {
        record('admin login', false, `status=${login.status}`);
      } else {
        record('admin login', true);
        const token = login.data.accessToken;
        for (const path of PROTECTED) {
          try {
            const response = await call(path, { token });
            record(`authenticated ${path}`, response.status === 200, `status=${response.status}`);
            if (path === '/api/nodes' && response.status === 200) {
              const nodes = Array.isArray(response.data) ? response.data : response.data?.data || [];
              const online = nodes.filter((node) => node.online === true || node.status === 'ONLINE');
              record('node ONLINE', online.length > 0, `online=${online.length}/${nodes.length}`);
            }
          } catch (error) {
            record(`authenticated ${path}`, false, error.message);
          }
        }
        if (PANEL_SETTINGS_PATH) {
          try {
            const response = await call(PANEL_SETTINGS_PATH, { token });
            record(`panel settings ${PANEL_SETTINGS_PATH}`, response.status === 200, `status=${response.status}`);
          } catch (error) {
            record(`panel settings ${PANEL_SETTINGS_PATH}`, false, error.message);
          }
        } else {
          skip('panel settings read', 'set SMOKE_PANEL_SETTINGS_PATH when the API exists');
        }
      }
    } catch (error) {
      record('admin login', false, error.message);
    }
  }

  const failed = results.filter((r) => r.ok === false);
  console.log(`Summary: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Smoke harness error: ${error.message}`);
  process.exitCode = 1;
});
