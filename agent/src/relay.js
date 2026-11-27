// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use strict';

// Transparent TCP relays (Mistgate style): plain byte streams in both
// directions, no TLS termination and no key material involved.
const net = require('net');
const fs = require('fs');
const path = require('path');

const RELAY_CONFIG_PATH = process.env.RELAY_CONFIG_PATH || '/etc/xss-agent/relays.json';

// Wire limits for the internal bridge protocol. These are deliberately small
// enough to bound memory but large enough for normal TCP segments.
const MODES = new Set(['direct', 'bridge-entry', 'bridge-exit']);
const MAX_CHANNELS = 10000;
const MAX_HEADER_BYTES = 4096;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const DEFAULT_REPLICAS = 2;
const MAX_REPLICAS = 8;
const MAX_RECONNECT_DELAY_MS = 5000;
const EMPTY = Buffer.alloc(0);

// id -> { id, listenPort, targetHost, targetPort, enabled, server, sockets, ... }
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
  if (net.isIPv4(host)) return host.startsWith('127.');
  if (net.isIP(host) === 6) return host === '::1' || host === '0:0:0:0:0:0:0:1';
  return false;
}

function relaySignature(relay) {
  return JSON.stringify({
    listenPort: relay.listenPort,
    targetHost: relay.targetHost,
    targetPort: relay.targetPort,
    targets: relay.targets || [],
    mode: relay.mode || 'direct',
    bridgePort: relay.bridgePort || null,
    bridgeHost: relay.bridgeHost || null,
    replicas: relay.replicas || 0,
  });
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

    const mode = entry.mode === undefined || entry.mode === null || entry.mode === ''
      ? 'direct' : entry.mode;
    if (!MODES.has(mode)) throw new Error(`relay ${id}: mode is invalid`);

    let bridgePort = null;
    if (entry.bridgePort !== undefined && entry.bridgePort !== null && entry.bridgePort !== '') {
      bridgePort = normalizePort(entry.bridgePort);
      if (bridgePort === null) throw new Error(`relay ${id}: bridgePort must be 1..65535`);
    }
    if (mode !== 'direct' && bridgePort === null) {
      throw new Error(`relay ${id}: bridgePort is required in ${mode} mode`);
    }
    if (bridgePort !== null && bridgePort === listenPort) {
      throw new Error(`relay ${id}: bridgePort must differ from listenPort`);
    }

    let bridgeHost = null;
    if (entry.bridgeHost !== undefined && entry.bridgeHost !== null && entry.bridgeHost !== '') {
      bridgeHost = normalizeHost(entry.bridgeHost);
      if (!bridgeHost) throw new Error(`relay ${id}: bridgeHost must be a hostname or IP`);
    }
    if (mode === 'bridge-exit' && !bridgeHost) {
      throw new Error(`relay ${id}: bridgeHost is required in bridge-exit mode`);
    }
    if (mode === 'bridge-exit' && bridgeHost && isLoopbackHost(bridgeHost) && bridgePort === listenPort) {
      throw new Error(`relay ${id}: refusing loopback self-relay on bridge port ${bridgePort}`);
    }

    let replicas = DEFAULT_REPLICAS;
    if (entry.replicas !== undefined && entry.replicas !== null && entry.replicas !== '') {
      const value = Number(entry.replicas);
      if (!Number.isInteger(value) || value < 1 || value > MAX_REPLICAS) {
        throw new Error(`relay ${id}: replicas must be 1..${MAX_REPLICAS}`);
      }
      replicas = value;
    }

    // Only bridge-entry binds bridgePort locally; bridge-exit connects to it.
    if (mode === 'bridge-entry' && bridgePort !== null && ports.has(bridgePort)) {
      throw new Error(`relay ${id}: duplicate bridgePort ${bridgePort}`);
    }
    ids.add(id);
    ports.add(listenPort);
    if (mode === 'bridge-entry') ports.add(bridgePort);
    result.push({
      id, listenPort,
      targetHost: targets[0].host, targetPort: targets[0].port,
      targets, enabled: entry.enabled !== false,
      mode, bridgePort, bridgeHost, replicas,
    });
  }
  return result;
}

// Only error codes and the opaque relay id are logged. Never log hosts,
// ports, config values or payload bytes.
function logRelayError(state, scope, error) {
  console.error(`relay ${state.id} ${scope} error [${(error && error.code) || 'ERROR'}]`);
}

function logProtocolError(state) {
  console.error(`relay ${state.id} bridge error [BAD_FRAME]`);
}

function closeState(state) {
  state.stopped = true;
  try { state.server?.close(); } catch {}
  try { state.bridgeServer?.close(); } catch {}
  for (const rec of state.bridges || []) {
    if (rec.reconnectTimer) clearTimeout(rec.reconnectTimer);
    rec.reconnectTimer = null;
  }
  for (const socket of state.sockets) {
    try { socket.destroy(); } catch {}
  }
  state.sockets.clear();
  if (state.channels) state.channels.clear();
  if (state.bridges) state.bridges.clear();
}

function handleServerError(state, server, scope, error, cleanup) {
  logRelayError(state, scope, error);
  const owns = scope === 'bridge' ? state.bridgeServer === server : state.server === server;
  if (active.get(state.id) === state && owns) {
    if (cleanup) closeState(state);
    active.delete(state.id);
  }
}

/* ------------------------------------------------------------------ *
 * Bridge frame codec
 *
 * Frame: 4-byte big-endian header length, JSON header, raw payload.
 * Headers are {t:'open',c:<id>}, {t:'data',c:<id>} or {t:'close',c:<id>}.
 * Data headers also carry `l` (payload byte length) so that several frames
 * can share a single TCP segment; open/close keep the documented shape.
 * ------------------------------------------------------------------ */

function writeFrame(socket, header, payload) {
  if (!socket || !socket.writable) return false;
  let raw;
  try {
    raw = Buffer.from(JSON.stringify(header), 'utf8');
  } catch {
    return false;
  }
  if (!raw.length || raw.length > MAX_HEADER_BYTES) return false;
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(raw.length, 0);
  const body = payload && payload.length ? Buffer.concat([prefix, raw, payload]) : Buffer.concat([prefix, raw]);
  return socket.write(body);
}

function writeData(socket, channel, payload) {
  if (!socket || !socket.writable) return false;
  let ok = true;
  for (let offset = 0; offset < payload.length; offset += MAX_PAYLOAD_BYTES) {
    const part = payload.subarray(offset, Math.min(offset + MAX_PAYLOAD_BYTES, payload.length));
    ok = writeFrame(socket, { t: 'data', c: channel, l: part.length }, part) && ok;
  }
  return ok;
}

function createFrameDecoder(onFrame) {
  let pending = EMPTY;
  return {
    push(chunk) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= 4) {
        const headerLength = pending.readUInt32BE(0);
        if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) return false;
        if (pending.length < 4 + headerLength) break;
        let header;
        try {
          header = JSON.parse(pending.toString('utf8', 4, 4 + headerLength));
        } catch {
          return false;
        }
        if (!header || typeof header !== 'object' || Array.isArray(header)) return false;
        if (header.t !== 'open' && header.t !== 'data' && header.t !== 'close') return false;
        if (!Number.isSafeInteger(header.c) || header.c < 1 || header.c > MAX_CHANNELS) return false;
        const declared = header.t === 'data' ? header.l : 0;
        if (declared !== undefined && (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_PAYLOAD_BYTES)) {
          return false;
        }
        const payloadLength = declared || 0;
        if (pending.length < 4 + headerLength + payloadLength) break;
        const payload = payloadLength
          ? pending.subarray(4 + headerLength, 4 + headerLength + payloadLength)
          : EMPTY;
        pending = pending.subarray(4 + headerLength + payloadLength);
        try {
          onFrame(header, payload);
        } catch {
          return false;
        }
      }
      // A partial frame is fine, but never let one unbounded frame grow.
      return pending.length <= 4 + MAX_HEADER_BYTES + MAX_PAYLOAD_BYTES;
    },
  };
}

function makeBridgeRecord() {
  return {
    socket: null,
    decoder: null,
    channels: new Map(),
    // Local sockets paused because the bridge socket is congested.
    blocked: new Set(),
    // Local sockets waiting for drain while the bridge socket is paused.
    blockedByLocal: new Set(),
    reconnectTimer: null,
    attempts: 0,
    drainArmed: false,
    drainSocket: null,
  };
}

function pauseLocalSource(rec, source) {
  if (rec.blocked.has(source)) return;
  rec.blocked.add(source);
  try { source.pause(); } catch {}
  if (rec.socket && (rec.drainSocket !== rec.socket || !rec.drainArmed)) {
    rec.drainArmed = true;
    rec.drainSocket = rec.socket;
    rec.socket.on('drain', () => {
      for (const item of rec.blocked) {
        try { item.resume(); } catch {}
      }
      rec.blocked.clear();
    });
  }
}

function sendDataToBridge(rec, source, channel, payload) {
  if (!payload.length) return;
  if (!writeData(rec.socket, channel, payload)) pauseLocalSource(rec, source);
}

function sendControlToBridge(rec, header) {
  writeFrame(rec.socket, header);
}

function deliverToLocal(rec, local, payload) {
  if (!payload.length || !local || !local.writable) return;
  if (local.write(payload)) return;
  if (rec.blockedByLocal.has(local)) return;
  rec.blockedByLocal.add(local);
  try { rec.socket?.pause(); } catch {}
  local.once('drain', () => unblockLocal(rec, local));
}

function unblockLocal(rec, local) {
  rec.blockedByLocal.delete(local);
  rec.blocked.delete(local);
  if (rec.blockedByLocal.size === 0 && rec.socket && !rec.socket.destroyed) {
    try { rec.socket.resume(); } catch {}
  }
}

function allocateChannel(state) {
  if (state.channels.size >= MAX_CHANNELS) return null;
  let id = state.nextChannelId;
  for (let i = 0; i < MAX_CHANNELS; i += 1) {
    if (!state.channels.has(id)) {
      state.nextChannelId = (id % MAX_CHANNELS) + 1;
      return id;
    }
    id = (id % MAX_CHANNELS) + 1;
  }
  return null;
}

/* --------------------------- direct mode --------------------------- */

function startDirectRelay(state) {
  const sockets = state.sockets;
  const server = net.createServer((client) => {
    sockets.add(client);
    client.pause();
    let settled = false;
    let upstream;
    let index = 0;
    const targets = state.targets && state.targets.length
      ? state.targets
      : [{ host: state.targetHost, port: state.targetPort, priority: 0 }];

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
    // Only the error code and the non-secret relay id are logged.
    console.error(`relay ${state.id} server error [${error.code || 'ERROR'}]`);
    if (active.get(state.id)?.server === server) active.delete(state.id);
  });

  state.server = server;
  server.listen(state.listenPort, '0.0.0.0');
}

/* ------------------------- bridge-entry mode ----------------------- */

function handleEntryClient(state, client) {
  state.sockets.add(client);
  client.setNoDelay(true);
  client.pause();

  let rec = null;
  let channel = null;
  let settled = false;

  const cleanup = (sendClose) => {
    if (settled) return;
    settled = true;
    state.sockets.delete(client);
    if (rec && channel !== null) {
      if (sendClose) sendControlToBridge(rec, { t: 'close', c: channel });
      rec.channels.delete(channel);
      state.channels.delete(channel);
      unblockLocal(rec, client);
      rec.blocked.delete(client);
    }
    channel = null;
    rec = null;
    try { client.destroy(); } catch {}
  };

  const available = [...state.bridges].filter((item) =>
    item.socket && item.socket.writable && item.channels.size < MAX_CHANNELS);
  if (!available.length) { cleanup(false); return; }
  const chosen = available[state.nextBridge % available.length];
  state.nextBridge = (state.nextBridge + 1) % available.length;
  const id = allocateChannel(state);
  if (id === null) { cleanup(false); return; }

  channel = id;
  rec = chosen;
  rec.channels.set(channel, { client, close: (sendClose) => cleanup(sendClose === true) });
  state.channels.set(channel, { client, bridge: rec });
  sendControlToBridge(rec, { t: 'open', c: channel });

  client.on('data', (chunk) => {
    if (!settled && rec && rec.socket && rec.socket.writable) {
      sendDataToBridge(rec, client, channel, chunk);
    }
  });
  client.on('error', () => cleanup(true));
  client.on('end', () => cleanup(true));
  client.on('close', () => cleanup(false));
  client.resume();
}

function startBridgeEntry(state) {
  const sockets = state.sockets;
  const bridges = state.bridges;

  const bridgeServer = net.createServer((socket) => {
    const rec = makeBridgeRecord();
    bridges.add(rec);
    sockets.add(socket);
    socket.setNoDelay(true);
    rec.socket = socket;
    rec.decoder = createFrameDecoder((header, payload) => {
      if (header.t === 'data') {
        const binding = rec.channels.get(header.c);
        if (binding) deliverToLocal(rec, binding.client, payload);
      } else if (header.t === 'close') {
        const binding = rec.channels.get(header.c);
        if (binding) binding.close(false);
      }
      // 'open' frames are initiated by entry only; ignore them here.
    });
    socket.on('data', (chunk) => {
      if (!rec.decoder.push(chunk)) {
        logProtocolError(state);
        socket.destroy();
      }
    });
    socket.on('error', (error) => logRelayError(state, 'bridge', error));
    socket.on('close', () => {
      sockets.delete(socket);
      bridges.delete(rec);
      for (const binding of [...rec.channels.values()]) binding.close(false);
      rec.channels.clear();
      rec.blocked.clear();
      rec.blockedByLocal.clear();
    });
  });
  bridgeServer.on('error', (error) => handleServerError(state, bridgeServer, 'bridge', error, true));
  state.bridgeServer = bridgeServer;

  const server = net.createServer((client) => handleEntryClient(state, client));
  server.on('error', (error) => handleServerError(state, server, 'server', error, true));
  state.server = server;

  bridgeServer.listen(state.bridgePort, '0.0.0.0');
  server.listen(state.listenPort, '0.0.0.0');
}

/* ------------------------- bridge-exit mode ------------------------ */

function handleExitFrame(state, rec, header, payload) {
  if (header.t === 'open') {
    const channel = header.c;
    if (rec.channels.has(channel) || rec.channels.size >= MAX_CHANNELS ||
        state.sockets.size >= MAX_CHANNELS * 2) {
      sendControlToBridge(rec, { t: 'close', c: channel });
      return;
    }
    let target;
    try {
      target = net.createConnection({ host: state.targetHost, port: state.targetPort });
    } catch {
      sendControlToBridge(rec, { t: 'close', c: channel });
      return;
    }
    target.setNoDelay(true);
    state.sockets.add(target);
    let opened = false;
    const cleanup = (sendClose) => {
      if (!opened) {
        opened = true;
        rec.channels.delete(channel);
        state.sockets.delete(target);
        unblockLocal(rec, target);
        rec.blocked.delete(target);
        if (sendClose) sendControlToBridge(rec, { t: 'close', c: channel });
        try { target.destroy(); } catch {}
      }
    };
    rec.channels.set(channel, { target, close: (sendClose) => cleanup(sendClose === true) });
    target.on('data', (chunk) => {
      if (rec.socket && rec.socket.writable) sendDataToBridge(rec, target, channel, chunk);
    });
    target.on('error', () => cleanup(true));
    target.on('close', () => cleanup(false));
    return;
  }

  if (header.t === 'data') {
    const binding = rec.channels.get(header.c);
    if (binding) deliverToLocal(rec, binding.target, payload);
    return;
  }

  if (header.t === 'close') {
    const binding = rec.channels.get(header.c);
    if (binding) binding.close(false);
  }
}

function scheduleBridgeReconnect(state, rec) {
  if (state.stopped || rec.reconnectTimer) return;
  const delay = Math.min(MAX_RECONNECT_DELAY_MS, 250 * (2 ** Math.min(rec.attempts, 5)));
  rec.attempts += 1;
  rec.reconnectTimer = setTimeout(() => {
    rec.reconnectTimer = null;
    connectExitBridge(state, rec);
  }, delay);
}

function connectExitBridge(state, rec) {
  if (state.stopped) return;
  state.bridges.add(rec);
  let socket;
  try {
    socket = net.createConnection({ host: state.bridgeHost, port: state.bridgePort });
  } catch (error) {
    logRelayError(state, 'connect', error);
    scheduleBridgeReconnect(state, rec);
    return;
  }
  rec.socket = socket;
  rec.decoder = createFrameDecoder((header, payload) => {
    if (!state.stopped) handleExitFrame(state, rec, header, payload);
  });
  state.sockets.add(socket);
  socket.setNoDelay(true);
  socket.once('connect', () => { rec.attempts = 0; });
  socket.on('data', (chunk) => {
    if (!rec.decoder.push(chunk)) {
      logProtocolError(state);
      socket.destroy();
    }
  });
  socket.on('error', (error) => logRelayError(state, 'bridge', error));
  socket.on('close', () => {
    state.sockets.delete(socket);
    if (rec.socket === socket) rec.socket = null;
    for (const binding of [...rec.channels.values()]) binding.close(false);
    rec.channels.clear();
    rec.blocked.clear();
    rec.blockedByLocal.clear();
    scheduleBridgeReconnect(state, rec);
  });
}

function startBridgeExit(state) {
  for (let i = 0; i < state.replicas; i += 1) {
    connectExitBridge(state, makeBridgeRecord());
  }
}

function startRelay(relay) {
  const state = {
    ...relay,
    sockets: new Set(),
    bridges: new Set(),
    channels: new Map(),
    nextChannelId: 1,
    nextBridge: 0,
    stopped: false,
    signature: relaySignature(relay),
  };
  if (relay.mode === 'bridge-entry') startBridgeEntry(state);
  else if (relay.mode === 'bridge-exit') startBridgeExit(state);
  else startDirectRelay(state);
  active.set(relay.id, state);
  return state;
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
    if (existing && existing.signature === relaySignature(relay)) continue;
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
    const bridges = state?.bridges ? [...state.bridges] : [];
    const connections = bridges.filter((rec) => rec.socket && !rec.socket.destroyed).length;
    const mode = relay.mode || 'direct';
    const bridge = {
      mode,
      listening: mode === 'bridge-entry' ? Boolean(state?.bridgeServer?.listening) : false,
      connections,
      channels: mode === 'bridge-entry'
        ? (state?.channels?.size || 0)
        : bridges.reduce((count, rec) => count + rec.channels.size, 0),
      replicas: mode === 'bridge-exit' ? relay.replicas : 0,
    };
    return {
      id: relay.id,
      listenPort: relay.listenPort,
      targetHost: relay.targetHost,
      targetPort: relay.targetPort,
      targets: relay.targets || [],
      enabled: relay.enabled,
      mode,
      listening: mode === 'bridge-exit'
        ? connections > 0
        : Boolean(state?.server?.listening),
      bridge,
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
