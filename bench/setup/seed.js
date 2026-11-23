const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const { PrismaClient } = backendRequire('@prisma/client');

const baseUrl = process.env.BENCH_BASE_URL || 'http://127.0.0.1:3000';
const adminEmail = process.env.BENCH_ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.BENCH_ADMIN_PASSWORD || 'bench-admin-pass-123';
const metricsToken = process.env.BENCH_METRICS_TOKEN || 'bench-metrics-token';
const targetUsers = Number(process.env.BENCH_USERS || 5000);
const runId = Date.now().toString(36);

async function api(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point at the bench database');

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const authHeaders = { authorization: `Bearer ${login.accessToken}` };

  const node = await api('/api/nodes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: `bench-node-${runId}`, address: '127.0.0.1' }),
  });

  const user = await api('/api/users', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: `bench-user-${runId}@example.com`,
      password: 'bench-user-pass-123',
    }),
  });

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const template = await prisma.user.findUnique({ where: { id: user.id } });
    const extra = Math.max(0, targetUsers - 2);
    for (let offset = 0; offset < extra; offset += 500) {
      const batch = [];
      for (let i = offset; i < Math.min(offset + 500, extra); i += 1) {
        batch.push({
          email: `bench-${runId}-${i}@example.com`,
          passwordHash: template.passwordHash,
          organizationId: template.organizationId,
        });
      }
      await prisma.user.createMany({ data: batch, skipDuplicates: true });
    }
  } finally {
    await prisma.$disconnect();
  }

  const context = {
    baseUrl,
    adminEmail,
    adminPassword,
    metricsToken,
    accessToken: login.accessToken,
    nodeId: node.id,
    nodeToken: node.agentToken,
    userId: user.id,
    subscriptionToken: user.subscriptionToken,
    targetUsers,
    runId,
  };
  const resultsDir = path.resolve(__dirname, '../results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const contextFile = path.join(resultsDir, 'context.json');
  fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
  console.log(`Seeded ${targetUsers} users and 1 node; context written to ${contextFile}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
