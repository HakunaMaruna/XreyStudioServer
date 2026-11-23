import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
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
  'User',
  'Organization',
];

describe('XSS API (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const email = process.env.ADMIN_EMAIL || 'e2e-admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'e2e-password123';

  const reset = async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL e2e tests');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = login.body.accessToken;
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  const auth = (req: any) => req.set('Authorization', `Bearer ${token}`);

  it('reports health and rejects bad credentials', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'definitely-wrong' })
      .expect(401);
  });

  it('creates users and sorts them on the server', async () => {
    for (const name of ['zeta', 'alpha', 'mu']) {
      await auth(
        request(app.getHttpServer()).post('/api/users').send({ email: `${name}@example.com`, password }),
      ).expect(201);
    }

    const asc = await auth(
      request(app.getHttpServer()).get('/api/users?sortBy=email&sortOrder=asc&limit=100'),
    ).expect(200);
    const ascEmails = asc.body.data.map((u: { email: string }) => u.email);
    expect(asc.body.total).toBe(4);
    expect(ascEmails).toEqual([...ascEmails].sort());

    const desc = await auth(
      request(app.getHttpServer()).get('/api/users?sortBy=email&sortOrder=desc&limit=100'),
    ).expect(200);
    const descEmails = desc.body.data.map((u: { email: string }) => u.email);
    expect(descEmails).toEqual([...descEmails].reverse().sort((a, b) => b.localeCompare(a)));

    const page = await auth(
      request(app.getHttpServer()).get('/api/users?page=2&limit=2&sortBy=email&sortOrder=asc'),
    ).expect(200);
    expect(page.body).toMatchObject({ page: 2, limit: 2, total: 4 });
    expect(page.body.data).toHaveLength(2);

    await auth(
      request(app.getHttpServer()).get('/api/users?sortBy=not_a_column'),
    ).expect(400);
  });

  it('validates and persists hosts and rules', async () => {
    await auth(request(app.getHttpServer()).post('/api/hosts').send({ address: 'example.com' })).expect(400);
    const host = await auth(
      request(app.getHttpServer()).post('/api/hosts').send({ address: 'example.com', port: 443 }),
    ).expect(201);
    expect(host.body).toMatchObject({ address: 'example.com', port: 443, enabled: true });
    expect(await prisma.host.count()).toBe(1);

    await auth(
      request(app.getHttpServer()).post('/api/rules').send({ name: 'bad', type: 'field', payload: 'oops' }),
    ).expect(400);
    const rule = await auth(
      request(app.getHttpServer())
        .post('/api/rules')
        .send({ name: 'direct', type: 'field', payload: { outboundTag: 'direct' } }),
    ).expect(201);
    expect(rule.body).toMatchObject({ name: 'direct', enabled: true });
    expect(await prisma.rule.count()).toBe(1);
  });

  it('stores Grafana alerts and exposes their history', async () => {
    const payload = {
      status: 'firing',
      title: 'XSS alert',
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'Disk full', severity: 'warning' },
          annotations: { description: 'disk usage above 90%' },
        },
      ],
    };
    await request(app.getHttpServer()).post('/api/notifications/alerts').send(payload).expect(401);
    const received = await request(app.getHttpServer())
      .post('/api/notifications/alerts')
      .set('Authorization', `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`)
      .send(payload)
      .expect(201);
    expect(received.body).toMatchObject({ received: 1, persisted: 1 });

    const history = await auth(
      request(app.getHttpServer()).get('/api/notifications/alerts?page=1&limit=10'),
    ).expect(200);
    expect(history.body.total).toBe(1);
    expect(history.body.data[0]).toMatchObject({
      status: 'firing',
      title: 'Disk full',
      severity: 'warning',
      source: 'grafana',
    });

    const filtered = await auth(
      request(app.getHttpServer()).get('/api/notifications/alerts?status=resolved'),
    ).expect(200);
    expect(filtered.body.total).toBe(0);
  });

  it('reports configured notification channels without secrets', async () => {
    const channels = await auth(request(app.getHttpServer()).get('/api/notifications/channels')).expect(200);
    expect(Object.keys(channels.body).sort()).toEqual(['email', 'signal', 'telegram', 'webhook']);
    expect(JSON.stringify(channels.body)).not.toContain(process.env.ALERT_WEBHOOK_TOKEN as string);
  });

  it('records per-user traffic, enforces the quota and provisions paid plans', async () => {
    const node = await prisma.node.create({
      data: {
        name: 'e2e-node',
        address: '127.0.0.1',
        tokenHash: createHash('sha256').update('pg-node-token').digest('hex'),
      },
    });
    const user = await prisma.user.findFirstOrThrow({ where: { email: 'alpha@example.com' } });
    await prisma.user.update({ where: { id: user.id }, data: { trafficLimit: 120n } });

    await request(app.getHttpServer())
      .post(`/api/nodes/${node.id}/traffic`)
      .set('Authorization', 'Bearer pg-node-token')
      .send({ entries: [{ subscriptionToken: user.subscriptionToken, up: 100, down: 30 }] })
      .expect(201);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.trafficUsed).toBe(130n);
    expect(refreshed.status).toBe('EXPIRED');

    const status = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.subscriptionToken}?format=json`)
      .expect(200);
    expect(status.body.status).toBe('exceeded');
    await request(app.getHttpServer()).get(`/api/subscriptions/${user.subscriptionToken}/raw`).expect(403);

    const plan = await auth(
      request(app.getHttpServer())
        .post('/api/payments/plans')
        .send({ name: 'Pro', price: 10, trafficGb: 50, durationDays: 30 }),
    ).expect(201);
    const payment = await auth(
      request(app.getHttpServer())
        .post('/api/payments')
        .send({ userId: user.id, amount: 10, planId: plan.body.id }),
    ).expect(201);
    await auth(request(app.getHttpServer()).post(`/api/payments/${payment.body.id}/paid`)).expect(201);

    const provisioned = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(provisioned.status).toBe('ACTIVE');
    expect(provisioned.trafficUsed).toBe(0n);
    expect(provisioned.trafficLimit).toBe(50n * 1024n ** 3n);
    expect(provisioned.expiresAt).toBeTruthy();
  });
});
