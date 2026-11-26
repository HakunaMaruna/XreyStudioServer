'use strict';

// Transparent TCP relays (Mistgate style): plain byte streams in both
// directions, no TLS termination and no key material involved.
const net = require('net');
const fs = require('fs');
const path = require('path');

const RELAY_CONFIG_PATH = process.env.RELAY_CONFIG_PATH || '/etc/xss-agent/relays.json';

// id -> { id, listenPort, targetHost, targetPort, enabled, server, sockets }
const active = new Map();
let currentConfig = [];

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function normalizeHost(value) {
  if (typeof value !== 'string') return null;
  let host = value.trim();
  if (!host || host.length > 253) return null;
  // Reject control chars / whitespace, path parts and URL-ish values.
  if (/[\u0000-\u0020\u007f]/.test(host) || /[/\\@?#]/.test(host)) return null;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) return null;
  if (net.isIP(host)) return host;
  // Plain hostname only: no scheme, port, userinfo, shell syntax, etc.
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/.test(host)) {
    return host;
  }
  return null;
}

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  const id = String(value);
  if (!id || id.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(id)) return null;
  return id;
}

function isLoopbackHost(host) {
  if (host === 'localhost' || host === 'localhost.') return true;
  const ip = net.isIP(host);
  if (ip === 4) return host.startsWith('127.');
  if (ip === 6) return host === '::1' || host === '0:0:0:0:0:0:0:1';
  return false;
}

/** Validate and strip everything except the fields a relay actually needs. */
function normalizeRelays(config) {
  if (!Array.isArray(config)) throw new TypeError('relays must be an array');
  const ids = new Set();
  const ports = new Set();
  const result = [];
  for (const entry of config) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('relay entry must be an object');
    }
    const id = normalizeId(entry.id);
    const listenPort = normalizePort(entry.listenPort);
    const targetsSource = Array.isArray(entry.targets) && entry.targets.length
      ? [...entry.targets].sort((a, b) => Number(a?.priority || 0) - Number(b?.priority || 0))
      : [{ host: entry.targetHost, port: entry.targetPort, priority: 0 }];
    const targets = [];
    for (const target of targetsSource) {
      const host = normalizeHost(target?.host ?? target?.targetHost);
      const port = normalizePort(target?.port ?? target?.targetPort);
      if (!host) throw new Error(`relay ${id}: targetHost must be a hostname or IP`);
      if (port === null) throw new Error(`relay ${id}: targetPort must be 1..65535`);
      if (isLoopbackHost(host) && listenPort === port) {
        throw new Error(`relay ${id}: refusing loopback self-relay on port ${listenPort}`);
      }
      targets.push({ host, port, priority: Number(target?.priority || 0) });
    }
    if (!id) throw new Error('relay id is invalid');
    if (ids.has(id)) throw new Error(`relay ${id}: duplicate id`);
    if (listenPort === null) throw new Error(`relay ${id}: listenPort must be 1..65535`);
    if (ports.has(listenPort)) throw new Error(`relay ${id}: duplicate listenPort ${listenPort}`);
    ids.add(id);
    ports.add(listenPort);
    result.push({
      id, listenPort,
      targetHost: targets[0].host, targetPort: targets[0].port,
      targets, enabled: entry.enabled !== false,
    });
  }
  return result;
}

function closeState(state) {
  try { state.server.close(); } catch {}
  for (const socket of state.sockets) {
    try { socket.destroy(); } catch {}
  }
  state.sockets.clear();
}

function startRelay(relay) {
  const sockets = new Set();
  const server = net.createServer((client) => {
    sockets.add(client);
    client.pause();
    let settled = false;
    let upstream;
    let index = 0;
    const targets = relay.targets && relay.targets.length
      ? relay.targets
      : [{ host: relay.targetHost, port: relay.targetPort, priority: 0 }];

    const next = () => {
      if (settled || index >= targets.length) {
        if (!settled) client.destroy();
        return;
      }
      const target = targets[index++];
      let socket;
      try {
        socket = net.createConnection({ host: target.host, port: target.port });
      } catch {
        next();
        return;
      }
      const timer = setTimeout(() => {
        try { socket.destroy(); } catch {}
        next();
      }, 3000);
      socket.setTimeout(3000, () => {
        try { socket.destroy(); } catch {}
        next();
      });
      socket.once('connect', () => {
        if (settled) { socket.destroy(); return; }
        settled = true;
        clearTimeout(timer);
        upstream = socket;
        sockets.add(upstream);
        client.once('close', () => {
          sockets.delete(client);
          try { upstream.destroy(); } catch {}
        });
        upstream.once('close', () => {
          sockets.delete(upstream);
          try { client.destroy(); } catch {}
        });
        client.on('error', () => { try { client.destroy(); } catch {} });
        upstream.on('error', () => { try { upstream.destroy(); } catch {} });
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      });
      socket.once('error', () => {
        clearTimeout(timer);
        if (!settled) next();
      });
    };
    next();
  });
  server.on('error', (error) => {
    // Only the error code/message and the non-secret relay id are logged.
    console.error(`relay ${relay.id} server error [${error.code || 'ERROR'}]: ${error.message}`);
    if (active.get(relay.id)?.server === server) active.delete(relay.id);
  });

  active.set(relay.id, { ...relay, server, sockets });
  server.listen(relay.listenPort, '0.0.0.0');
}

/**
 * Reconcile running relays with the desired config.
 * @returns {{configured: number, started: number, stopped: number}}
 */
function applyRelays(config) {
  const desired = normalizeRelays(config);
  const desiredById = new Map(desired.map((relay) => [relay.id, relay]));
  let started = 0;
  let stopped = 0;

  for (const [id, state] of active) {
    const next = desiredById.get(id);
    if (!next || !next.enabled) {
      closeState(state);
      active.delete(id);
      stopped += 1;
    }
  }

  for (const relay of desired) {
    if (!relay.enabled) continue;
    const existing = active.get(relay.id);
    if (existing && existing.listenPort === relay.listenPort &&
        existing.targetHost === relay.targetHost && existing.targetPort === relay.targetPort &&
        JSON.stringify(existing.targets || []) === JSON.stringify(relay.targets || [])) {
      continue;
    }
    if (existing) {
      closeState(existing);
      active.delete(relay.id);
      stopped += 1;
    }
    startRelay(relay);
    started += 1;
  }

  currentConfig = desired;
  return { configured: desired.filter((relay) => relay.enabled).length, started, stopped };
}

function getRelays() {
  return currentConfig.map((relay) => ({ ...relay }));
}

function getRelayStatus() {
  return currentConfig.map((relay) => {
    const state = active.get(relay.id);
    return {
      id: relay.id,
      listenPort: relay.listenPort,
      targetHost: relay.targetHost,
      targetPort: relay.targetPort,
      targets: relay.targets || [],
      enabled: relay.enabled,
      listening: Boolean(state && state.server.listening),
    };
  });
}

function getRelaySummary() {
  const relays = getRelayStatus();
  return {
    configured: relays.filter((relay) => relay.enabled).length,
    active: relays.filter((relay) => relay.listening).length,
    relays,
  };
}

function loadRelays() {
  try {
    const data = JSON.parse(fs.readFileSync(RELAY_CONFIG_PATH, 'utf8'));
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.relays)) return data.relays;
  } catch {}
  return [];
}

function saveRelays(config) {
  const relays = normalizeRelays(config);
  fs.mkdirSync(path.dirname(RELAY_CONFIG_PATH), { recursive: true, mode: 0o700 });
  const tmp = `${RELAY_CONFIG_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(relays, null, 2), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, RELAY_CONFIG_PATH);
    try { fs.chmodSync(RELAY_CONFIG_PATH, 0o600); } catch {}
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
  }
}

module.exports = {
  RELAY_CONFIG_PATH,
  applyRelays,
  normalizeRelays,
  loadRelays,
  saveRelays,
  getRelays,
  getRelayStatus,
  getRelaySummary,
};
