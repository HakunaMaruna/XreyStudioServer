import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = [
  'AlertHistory',
  'AuditLog',
  'RefreshToken',
  'Payment',
  'Inbound',
  'ConfigRevision',
  'NodeMetric',
  'Node',
  'Host',
  'Rule',
  'UserTraffic',
  'User',
  'Organization',
  'SubscriptionPlan',
];

const userCount = Number(process.env.SCALE_USERS || 5000);
const nodeCount = Number(process.env.SCALE_NODES || 20);
const readRequests = Number(process.env.SCALE_READ_REQUESTS || 100);
const trafficRounds = Number(process.env.SCALE_TRAFFIC_ROUNDS || 1);
const entriesPerNode = Number(process.env.SCALE_ENTRIES_PER_NODE || 10);
const concurrency = Math.max(1, Number(process.env.SCALE_CONCURRENCY || 8));
const p95BudgetMs = Number(process.env.SCALE_P95_LIMIT_MS || 0);

interface Sample {
  ms: number;
  status: number;
}

interface Stats {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

async function runPool<T>(count: number, task: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const index = next++;
      results[index] = await task(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));
  return results;
}

function quantile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * fraction;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (pos - low));
}

function summarize(label: string, samples: Sample[], elapsedMs: number): Stats {
  const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const stats = {
    count: samples.length,
    errors: samples.filter((sample) => sample.status >= 400).length,
    p50: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    p99: quantile(times, 0.99),
    max: Math.round(times[times.length - 1] || 0),
  };
  console.log(
    `${label}: n=${stats.count} errors=${stats.errors} p50=${stats.p50}ms ` +
      `p95=${stats.p95}ms p99=${stats.p99}ms max=${stats.max}ms ` +
      `rps=${elapsedMs ? Math.round((samples.length / elapsedMs) * 1000) : 0}`,
  );
  return stats;
}

describe('XSS scale check (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token = '';
  let readStats: Stats;
  let trafficStats: Stats;
  const subscriptionTokens: string[] = [];
  const nodes: { id: string; token: string }[] = [];
  const period = new Date().toISOString().slice(0, 7);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  const auth = (req: any) => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the scale check');
    console.log(
      `Scale config: users=${userCount} nodes=${nodeCount} reads=${readRequests} ` +
        `rounds=${trafficRounds} entries/node=${entriesPerNode} concurrency=${concurrency}`,
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: process.env.ADMIN_EMAIL || 'e2e-admin@example.com', password: process.env.ADMIN_PASSWORD || 'e2e-password123' })
      .expect(201);
    token = login.body.accessToken;

    const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    for (let offset = 0; offset < userCount; offset += 500) {
      const batch = [];
      for (let index = offset; index < Math.min(offset + 500, userCount); index++) {
        const subscriptionToken = randomUUID();
        subscriptionTokens.push(subscriptionToken);
        batch.push({
          email: `load-user-${String(index).padStart(6, '0')}@example.com`,
          passwordHash: admin.passwordHash,
          organizationId: admin.organizationId,
          subscriptionToken,
          trafficLimit: BigInt(1024 * 1024 * 1024),
        });
      }
      await prisma.user.createMany({ data: batch });
    }

    for (let index = 0; index < nodeCount; index++) {
      const created = await auth(
        request(app.getHttpServer())
          .post('/api/nodes')
          .send({ name: `load-node-${index}`, address: `10.0.0.${index + 1}`, port: 443 }),
      ).expect(201);
      nodes.push({ id: created.body.id, token: created.body.agentToken });
    }
  }, 180000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 180000);

  it('serves paginated user lists at the target user count', async () => {
    const single = await auth(
      request(app.getHttpServer()).get('/api/users?search=load-user-000001'),
    ).expect(200);
    expect(single.body.total).toBe(1);
    expect(single.body.data[0].email).toBe('load-user-000001@example.com');

    const readStart = performance.now();
    const readSamples = await runPool(readRequests, async (index) => {
      const pages = Math.ceil((userCount + 1) / 50);
      const query =
        index % 10 === 0
          ? `search=load-user-${String((index * 7) % userCount).padStart(6, '0')}`
          : `page=${(index % pages) + 1}&limit=50&sortBy=email&sortOrder=asc`;
      const start = performance.now();
      const response = await auth(request(app.getHttpServer()).get(`/api/users?${query}`));
      return { ms: performance.now() - start, status: response.status };
    });
    readStats = summarize('user reads', readSamples, performance.now() - readStart);
    expect(readStats.errors).toBe(0);
    const page = await auth(request(app.getHttpServer()).get('/api/users?limit=50')).expect(200);
    expect(page.body.total).toBe(userCount + 1);
    expect(page.body.data).toHaveLength(50);
  }, 180000);

  it('accepts concurrent traffic reports from the target node count', async () => {
    const samples: Sample[] = [];
    const trafficStart = performance.now();
    for (let round = 0; round < trafficRounds; round++) {
      const roundSamples = await runPool(nodeCount, async (index) => {
        const entries = Array.from({ length: entriesPerNode }, (_, entry) => ({
          subscriptionToken: subscriptionTokens[(index * entriesPerNode + entry) % subscriptionTokens.length],
          up: 1024 * 1024,
          down: 2 * 1024 * 1024,
        }));
        const start = performance.now();
        const response = await request(app.getHttpServer())
          .post(`/api/nodes/${nodes[index].id}/traffic`)
          .set('Authorization', `Bearer ${nodes[index].token}`)
          .send({ entries, period });
        return { ms: performance.now() - start, status: response.status, recorded: response.body.recorded };
      });
      expect(roundSamples.every((sample) => sample.recorded === entriesPerNode)).toBe(true);
      samples.push(...roundSamples);
    }
    trafficStats = summarize('node traffic writes', samples, performance.now() - trafficStart);
    expect(trafficStats.errors).toBe(0);
    expect(await prisma.userTraffic.count()).toBe(nodeCount * entriesPerNode * trafficRounds);
  }, 180000);

  it('stays within the optional p95 budget', () => {
    if (p95BudgetMs > 0) {
      expect(readStats.p95).toBeLessThan(p95BudgetMs);
      expect(trafficStats.p95).toBeLessThan(p95BudgetMs);
    }
  });
});
