// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
const fs = require('fs');
const path = require('path');
const autocannon = require('autocannon');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const CONTEXT_FILE = path.join(RESULTS_DIR, 'context.json');

const BASE_URL = process.env.BENCH_BASE_URL || 'http://127.0.0.1:3000';

function loadContext() {
  if (!fs.existsSync(CONTEXT_FILE)) {
    throw new Error(`Missing ${CONTEXT_FILE}; run "npm run setup" first`);
  }
  return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
}

function options(overrides = {}) {
  return {
    url: BASE_URL,
    connections: Number(process.env.BENCH_CONNECTIONS || 20),
    pipelining: Number(process.env.BENCH_PIPELINING || 1),
    duration: Number(process.env.BENCH_DURATION || 10),
    ...overrides,
  };
}

function summarize(name, result) {
  const seconds = result.duration;
  return {
    name,
    durationSeconds: seconds,
    connections: result.connections,
    pipelining: result.pipelining,
    requests: {
      total: result.requests.total,
      sent: result.requests.sent,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      rps: Number((result.requests.total / seconds).toFixed(1)),
    },
    latencyMs: {
      p50: result.latency.p50,
      p90: result.latency.p90,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
    },
    throughputBytesPerSecond: {
      total: result.throughput.total,
      inbound: result.throughput.incoming,
      outbound: result.throughput.outgoing,
    },
    statusCodes: result.statusCodeStats || result.statusCodes || {},
  };
}

async function run(name, overrides) {
  const result = await autocannon(options(overrides));
  const summary = summarize(name, result);
  console.log(
    `${name.padEnd(14)} rps=${summary.requests.rps} p50=${summary.latencyMs.p50}ms ` +
      `p97.5=${summary.latencyMs.p97_5}ms p99=${summary.latencyMs.p99}ms ` +
      `errors=${summary.requests.errors} statuses=${JSON.stringify(summary.statusCodes)}`,
  );
  return summary;
}

function writeResults(summaries) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, 'latest.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, scenarios: summaries }, null, 2),
  );
  return file;
}

module.exports = { BASE_URL, RESULTS_DIR, CONTEXT_FILE, loadContext, options, run, writeResults };
