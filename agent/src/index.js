require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const { timingSafeEqual } = require('crypto');
const si = require('systeminformation');

const PANEL_URL = (process.env.PANEL_URL || 'http://localhost:3000').replace(/\/$/, '');
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const AGENT_SECRET = process.env.AGENT_SECRET || process.env.AGENT_TOKEN || '';
const NODE_ID = process.env.NODE_ID || '';
const PORT = Number(process.env.PORT || 9090);
const CONFIG_PATH = process.env.XRAY_CONFIG_PATH || '/etc/xray/config.json';
const XRAY_BIN = process.env.XRAY_BIN || 'xray';
const XRAY_SERVICE = process.env.XRAY_SERVICE || 'xray';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(CONFIG_PATH), 'backups');
const SINGBOX_CONFIG_PATH = process.env.SINGBOX_CONFIG_PATH || '/etc/sing-box/config.json';
const SINGBOX_BIN = process.env.SINGBOX_BIN || 'sing-box';
const SINGBOX_SERVICE = process.env.SINGBOX_SERVICE || 'sing-box';
const NODE_STUB_PORT = Number(process.env.NODE_STUB_PORT || 18080);
const NODE_STUB_ENABLED = process.env.NODE_STUB_ENABLED !== 'false';
const XRAY_STATS_ENABLED = process.env.XRAY_STATS_ENABLED === 'true';
const XRAY_API_HOST = process.env.XRAY_API_HOST || '127.0.0.1';
const XRAY_API_PORT = Number(process.env.XRAY_API_PORT || 8080);
const TRAFFIC_INTERVAL = Math.max(15000, Number(process.env.TRAFFIC_REPORT_INTERVAL || 60000));
const GEOCHECK_URL = process.env.GEOCHECK_URL || 'https://ipinfo.io/json';
const GEOCHECK_INTERVAL = Math.max(3600000, Number(process.env.GEOCHECK_INTERVAL || 21600000));
// Версия агента: панель сравнивает её со своей и показывает устаревшие ноды.
const AGENT_VERSION = (() => {
  if (process.env.AGENT_VERSION) return String(process.env.AGENT_VERSION).trim();
  try {
    return String(require('../package.json').version || '').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
})();

let xrayStatus = 'unknown';
let singboxStatus = 'unknown';
let lastGood = null;
let lastConfigVersion = 0;
let lastNet = null;
let lastAppliedConfig = null;
let activeServer = null;
let xrayProcess = null;
const XRAY_MANAGED = process.env.XRAY_MANAGED === 'true';
const TLS_DIR = process.env.AGENT_TLS_DIR || '/etc/xss-agent/tls';
const lastUserStats = new Map();

const app = express();
app.use(express.json({ limit: '20mb' }));

function run(cmd, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '', error: error?.message });
    });
  });
}

function auth(req, res, next) {
  const header = String(req.headers['x-agent-secret'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = String(AGENT_SECRET || '');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function ensureDirs() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupCurrent() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  const target = path.join(BACKUP_DIR, `config-${Date.now()}.json`);
  fs.copyFileSync(CONFIG_PATH, target);
  lastGood = target;
  return target;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Config must be an object');
  if (!Array.isArray(config.inbounds)) throw new Error('inbounds must be an array');
  if (!Array.isArray(config.outbounds)) throw new Error('outbounds must be an array');
  for (const inbound of config.inbounds) {
    if (!inbound.tag || !inbound.port || !inbound.protocol) {
      throw new Error('Inbound must have tag, port and protocol');
    }
  }
}

function validateSingbox(config) {
  if (!config || typeof config !== 'object') throw new Error('Sing-box config must be an object');
  if (!Array.isArray(config.inbounds)) throw new Error('sing-box inbounds must be an array');
  if (!Array.isArray(config.outbounds)) throw new Error('sing-box outbounds must be an array');
}

async function applySingboxConfig(config, version) {
  validateSingbox(config);
  fs.mkdirSync(path.dirname(SINGBOX_CONFIG_PATH), { recursive: true });
  const tmp = path.join(path.dirname(SINGBOX_CONFIG_PATH), `singbox-candidate-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  const test = await run(SINGBOX_BIN, ['check', '-c', tmp], 8000);
  if (!test.ok && !test.error?.includes('ENOENT')) {
    fs.unlinkSync(tmp);
    throw new Error(`sing-box config check failed: ${test.stderr || test.error}`);
  }
  fs.copyFileSync(tmp, SINGBOX_CONFIG_PATH);
  fs.unlinkSync(tmp);
  const reload = await run('systemctl', ['reload-or-restart', SINGBOX_SERVICE], 10000);
  singboxStatus = reload.ok ? 'running' : 'error';
  return { engine: 'sing-box', applied: true, reloaded: reload.ok, version: version || lastConfigVersion };
}

async function applyConfig(config, version) {
  lastAppliedConfig = config;
  if (config && (config.xray || config.singbox)) {
    const results = [];
    if (config.xray) results.push(await applyXrayConfig(config.xray, version));
    if (config.singbox) results.push(await applySingboxConfig(config.singbox, version));
    return { applied: true, engines: results, version: version || lastConfigVersion };
  }
  return applyXrayConfig(config, version);
}

// В контейнере нет systemd — Xray живёт как дочерний процесс агента.
function stopManagedXray() {
  if (!xrayProcess) return;
  try { xrayProcess.kill('SIGTERM'); } catch {}
  xrayProcess = null;
}

async function startManagedXray() {
  stopManagedXray();
  const proc = spawn(XRAY_BIN, ['run', '-c', CONFIG_PATH], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  xrayProcess = proc;
  proc.stdout.on('data', (d) => {
    const line = String(d).trim();
    if (line) console.log('[xray]', line);
  });
  proc.stderr.on('data', (d) => {
    const line = String(d).trim();
    if (line) console.error('[xray]', line);
  });
  proc.on('exit', (code, signal) => {
    // Старый процесс может испустить exit уже после того, как мы сохранили
    // ссылку на новый — не перетираем её.
    if (xrayProcess !== proc) return;
    if (code && code !== 0) xrayStatus = 'error';
    else if (signal) xrayStatus = 'stopped';
    xrayProcess = null;
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const ok = Boolean(xrayProcess === proc && proc.exitCode === null);
  xrayStatus = ok ? 'running' : 'error';
  return ok;
}

async function reloadXrayService() {
  if (XRAY_MANAGED) {
    const ok = await startManagedXray();
    return { ok, stage: 'managed', error: ok ? null : 'xray exited during startup' };
  }
  const reload = await run('systemctl', ['reload-or-restart', XRAY_SERVICE], 10000);
  if (reload.ok) return { ok: true, stage: 'reload' };
  const restart = await run('systemctl', ['restart', XRAY_SERVICE], 10000);
  return { ok: restart.ok, stage: 'restart', error: restart.ok ? null : restart.stderr };
}

async function applyXrayConfig(config, version) {
  validateConfig(config);
  ensureDirs();
  const tmp = path.join(BACKUP_DIR, `candidate-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  const test = await run(XRAY_BIN, ['run', '-test', '-c', tmp], 8000);
  if (!test.ok) {
    fs.unlinkSync(tmp);
    throw new Error(`Xray config test failed: ${test.stderr || test.error}`);
  }
  backupCurrent();
  fs.copyFileSync(tmp, CONFIG_PATH);
  fs.unlinkSync(tmp);
  lastConfigVersion = version || lastConfigVersion;
  const reload = await reloadXrayService();
  xrayStatus = reload.ok ? 'running' : 'error';
  return {
    applied: true,
    reloaded: reload.ok,
    version: lastConfigVersion,
    managed: XRAY_MANAGED,
    error: reload.error || null,
  };
}

function parseStatValue(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    const stats = parsed.stat || [];
    return stats.reduce((sum, item) => sum + Number(item.value || 0), 0);
  } catch {
    // Старые версии Xray печатали просто число.
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^\d+$/.test(lines[i])) return Number(lines[i]);
    }
    return 0;
  }
}

async function queryUserStat(email, direction) {
  const server = `${XRAY_API_HOST}:${XRAY_API_PORT}`;
  const name = `user>>>${email}>>>traffic>>>${direction}`;
  // В Xray 26 команда statsq переименована в statsquery и принимает -pattern.
  let result = await run(XRAY_BIN, ['api', 'statsquery', '--server', server, '-pattern', name], 3000);
  if (!result.ok && /unknown command/i.test(result.stderr || '')) {
    result = await run(XRAY_BIN, ['api', 'statsq', '--server', server, '--name', name], 3000);
  }
  return result.ok ? parseStatValue(result.stdout) : 0;
}

async function collectTrafficEntries() {
  if (!XRAY_STATS_ENABLED) return [];
  const config = lastAppliedConfig?.xray || lastAppliedConfig;
  const emails = new Set();
  for (const inbound of config?.inbounds || []) {
    for (const client of inbound.settings?.clients || []) {
      if (client.email) emails.add(client.email);
    }
  }

  const entries = [];
  for (const email of emails) {
    const uplink = await queryUserStat(email, 'uplink');
    const downlink = await queryUserStat(email, 'downlink');
    const previous = lastUserStats.get(email) || { uplink: 0, downlink: 0 };
    const up = Math.max(0, uplink - previous.uplink);
    const down = Math.max(0, downlink - previous.downlink);
    lastUserStats.set(email, { uplink, downlink });
    if (up || down) entries.push({ email, up, down });
  }
  return entries;
}

async function sendTraffic() {
  try {
    const entries = await collectTrafficEntries();
    if (!entries.length) return;
    await fetch(`${PANEL_URL}/api/nodes/${NODE_ID}/traffic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
      body: JSON.stringify({ entries }),
    });
  } catch (e) {
    console.error('traffic report failed', e.message);
  }
}

function inboundPorts() {
  const ports = new Set();
  const collect = (config) => {
    for (const inbound of config?.inbounds || []) {
      if (inbound.port) ports.add(Number(inbound.port));
    }
  };
  if (lastAppliedConfig?.xray || lastAppliedConfig?.singbox) {
    collect(lastAppliedConfig.xray);
    collect(lastAppliedConfig.singbox);
  } else {
    collect(lastAppliedConfig);
  }
  return ports;
}

function countConnections() {
  const ports = inboundPorts();
  if (!ports.size) return 0;
  let count = 0;
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      // Local address is hex "IP:PORT", state 01 == TCP_ESTABLISHED.
      if (cols.length < 4 || cols[3] !== '01') continue;
      const port = parseInt((cols[1].split(':')[1] || ''), 16);
      if (ports.has(port)) count++;
    }
  }
  return count;
}

async function collectMetrics() {
  const [cpu, mem, fsSize, net] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
  ]);
  let up = 0;
  let down = 0;
  for (const iface of net || []) {
    up += iface.tx_bytes || 0;
    down += iface.rx_bytes || 0;
  }
  let trafficUp = 0;
  let trafficDown = 0;
  if (lastNet) {
    trafficUp = Math.max(0, up - lastNet.up);
    trafficDown = Math.max(0, down - lastNet.down);
  }
  lastNet = { up, down };
  return {
    cpu: Number(cpu.currentLoad?.toFixed(2) || 0),
    ram: Number((((mem.used || 0) / (mem.total || 1)) * 100).toFixed(2)),
    disk: Number(fsSize?.[0]?.use || 0),
    trafficUp,
    trafficDown,
    connections: countConnections(),
    xray: xrayStatus,
    singbox: singboxStatus,
  };
}

async function sendMetrics() {
  try {
    const metrics = await collectMetrics();
    await fetch(`${PANEL_URL}/api/nodes/${NODE_ID}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
      body: JSON.stringify({ ...metrics, agentVersion: AGENT_VERSION }),
    });
  } catch (e) {
    console.error('metrics failed', e.message);
  }
}

// Геолокация исходящего IP ноды — чтобы в панели было видно, откуда выходит трафик.
async function checkGeo() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let data;
    try {
      const res = await fetch(GEOCHECK_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`geo service returned ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const org = String(data.org || '');
    const asn = org.match(/^AS\d+/)?.[0] || '';
    const payload = JSON.stringify({
      ip: data.ip || '',
      countryCode: data.country || '',
      city: data.city || '',
      asn,
      org,
    });
    // Панель может ещё подниматься сразу после docker compose up — повторяем.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await fetch(`${PANEL_URL}/api/nodes/${NODE_ID}/geo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
        body: payload,
      });
      if (res.ok) break;
      if (attempt === 3) throw new Error(`geo report failed: ${res.status}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    console.log(`geo updated: ${data.country || '??'} ${data.city || ''} ${data.ip || ''}`);
  } catch (e) {
    console.error('geocheck failed', e.message);
  }
}

async function register() {
  try {
    const res = await fetch(`${PANEL_URL}/api/nodes/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
      body: JSON.stringify({ nodeId: NODE_ID, address: process.env.NODE_ADDRESS, agentVersion: AGENT_VERSION }),
    });
    console.log(`register: ${res.status} (agent ${AGENT_VERSION})`, await res.text());
  } catch (e) {
    console.error('register failed', e.message);
  }
}

async function pullConfig() {
  try {
    const res = await fetch(`${PANEL_URL}/api/nodes/${NODE_ID}/config`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.config || data.version <= lastConfigVersion) return;
    const result = await applyConfig(data.config, data.version);
    console.log('pulled config', result);
  } catch (e) {
    console.error('pull config failed', e.message);
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    nodeId: NODE_ID,
    xray: xrayStatus,
    singbox: singboxStatus,
    version: lastConfigVersion,
    agentVersion: AGENT_VERSION,
  });
});

app.get('/metrics', auth, async (req, res) => {
  res.json(await collectMetrics());
});

app.post('/config', auth, async (req, res) => {
  try {
    const config = req.body.config || req.body;
    const result = await applyConfig(config, req.body.version || 0);
    res.json(result);
  } catch (e) {
    xrayStatus = 'error';
    res.status(400).json({ applied: false, error: e.message });
  }
});

app.post('/rollback', auth, async (req, res) => {
  if (!lastGood || !fs.existsSync(lastGood)) {
    return res.status(400).json({ error: 'No backup available' });
  }
  fs.copyFileSync(lastGood, CONFIG_PATH);
  const result = await reloadXrayService();
  res.json({ rolledBack: true, reloaded: result.ok, managed: XRAY_MANAGED });
});

app.post('/restart-xray', auth, async (req, res) => {
  const result = await reloadXrayService();
  xrayStatus = result.ok ? 'running' : 'error';
  res.json({ restarted: result.ok, managed: XRAY_MANAGED, error: result.error || null });
});

app.get('/logs', auth, async (req, res) => {
  const singbox = req.query.service === 'singbox';
  const service = singbox ? SINGBOX_SERVICE : XRAY_SERVICE;
  const lines = Math.min(1000, Math.max(1, Number(req.query.lines) || 200));
  const result = await run('journalctl', ['-u', service, '-n', String(lines), '--no-pager', '-o', 'cat'], 10000);
  let output = result.ok ? result.stdout : '';
  const logPath = singbox ? process.env.SINGBOX_LOG_PATH : process.env.XRAY_LOG_PATH;
  if (!output && logPath && fs.existsSync(logPath)) {
    output = fs.readFileSync(logPath, 'utf8').split('\n').slice(-lines).join('\n');
  }
  res.json({
    service,
    lines,
    output: String(output || '').slice(-200000),
    source: result.ok ? 'journalctl' : logPath ? 'file' : 'unavailable',
    error: result.ok || output ? null : result.stderr || result.error || null,
  });
});

app.post('/certificate', auth, (req, res) => {
  const { certificate, privateKey, hostname } = req.body || {};
  if (!certificate || !privateKey || !hostname) {
    return res.status(400).json({ error: 'certificate, privateKey and hostname are required' });
  }
  try {
    fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(TLS_DIR, 'fullchain.pem'), certificate, { mode: 0o600 });
    fs.writeFileSync(path.join(TLS_DIR, 'privkey.pem'), privateKey, { mode: 0o600 });
    startServer({
      cert: fs.readFileSync(path.join(TLS_DIR, 'fullchain.pem')),
      key: fs.readFileSync(path.join(TLS_DIR, 'privkey.pem')),
    });
    console.log(`installed TLS certificate for ${hostname}`);
    res.json({ installed: true, hostname, https: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function startServer(tlsOptions) {
  if (activeServer) activeServer.close();
  activeServer = tlsOptions ? https.createServer(tlsOptions, app) : http.createServer(app);
  activeServer.listen(PORT, () => console.log(`XSS agent listening on ${PORT}${tlsOptions ? ' (https)' : ''}`));
}

register();
setInterval(sendMetrics, 15000);
setInterval(pullConfig, 30000);
if (XRAY_STATS_ENABLED) {
  setInterval(sendTraffic, TRAFFIC_INTERVAL);
  setTimeout(sendTraffic, 5000);
}
setTimeout(sendMetrics, 1000);
setTimeout(pullConfig, 3000);
setTimeout(checkGeo, 10000);
setInterval(checkGeo, GEOCHECK_INTERVAL);

const tlsCert = process.env.AGENT_TLS_CERT;
const tlsKey = process.env.AGENT_TLS_KEY;
const server = tlsCert && tlsKey
  ? https.createServer(
      {
        cert: fs.readFileSync(tlsCert),
        key: fs.readFileSync(tlsKey),
        ca: process.env.AGENT_TLS_CA ? fs.readFileSync(process.env.AGENT_TLS_CA) : undefined,
        requestCert: Boolean(process.env.AGENT_TLS_CA),
        rejectUnauthorized: Boolean(process.env.AGENT_TLS_CA),
      },
      app,
    )
  : app;

server.listen(PORT, () => console.log(`XSS agent listening on ${PORT}`));

// Loopback decoy site for Xray fallbacks. It is never exposed on a public
// interface; only Xray's local fallback can reach it.
if (NODE_STUB_ENABLED && Number.isInteger(NODE_STUB_PORT) && NODE_STUB_PORT > 0 && NODE_STUB_PORT < 65536) {
  const stubPage = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Welcome</title></head><body><h1>Welcome</h1>'
    + '<p>This site is under construction.</p></body></html>';
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(stubPage);
  }).listen(NODE_STUB_PORT, '127.0.0.1', () => {
    console.log(`decoy site listening on 127.0.0.1:${NODE_STUB_PORT}`);
  }).on('error', (error) => {
    console.error(`decoy site failed on 127.0.0.1:${NODE_STUB_PORT}: ${error.message}`);
  });
}

// При перезапуске контейнера конфиг уже лежит на диске — поднимаем Xray сразу,
// не дожидаясь следующего pullConfig (панель может быть временно недоступна).
if (XRAY_MANAGED && fs.existsSync(CONFIG_PATH)) {
  setTimeout(async () => {
    try {
      const ok = await startManagedXray();
      console.log(`managed xray restored from ${CONFIG_PATH}: ${ok ? 'ok' : 'failed'}`);
      lastConfigVersion = lastConfigVersion || 1;
    } catch (error) {
      console.error('managed xray start failed', error.message);
    }
  }, 1500);
}
