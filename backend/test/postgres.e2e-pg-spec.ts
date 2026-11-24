import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigGeneratorService } from '../src/modules/config/config-generator.service';
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
      .send({ email, password: process.env.TEST_WRONG_PASSWORD || 'definitely-wrong' })
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
    const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
    const node = await prisma.node.create({
      data: {
        name: 'e2e-node',
        address: '127.0.0.1',
        organizationId: admin.organizationId,
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
    expect(status.body.links).toEqual([]);

    const statusJson = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.subscriptionToken}/json`)
      .expect(200);
    expect(statusJson.body.status).toBe('exceeded');
    expect(statusJson.body.links).toEqual([]);

    for (const format of ['raw', 'base64', 'clash', 'singbox']) {
      await request(app.getHttpServer())
        .get(`/api/subscriptions/${user.subscriptionToken}/${format}`)
        .expect(403);
    }

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

  it('keeps tenant users and rules out of another tenant node config', async () => {
    const generator = app.get(ConfigGeneratorService);
    const orgA = await prisma.organization.create({ data: { name: 'Tenant A', slug: 'tenant-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Tenant B', slug: 'tenant-b' } });
    const userA = await prisma.user.create({
      data: { email: 'tenant-a-user@example.com', passwordHash: 'hash', organizationId: orgA.id },
    });
    const userB = await prisma.user.create({
      data: { email: 'tenant-b-user@example.com', passwordHash: 'hash', organizationId: orgB.id },
    });
    const nodeA = await prisma.node.create({
      data: {
        name: 'tenant-a-node',
        address: '127.0.0.1',
        tokenHash: createHash('sha256').update('node-a-token').digest('hex'),
        organizationId: orgA.id,
      },
    });
    const nodeB = await prisma.node.create({
      data: {
        name: 'tenant-b-node',
        address: '127.0.0.1',
        tokenHash: createHash('sha256').update('node-b-token').digest('hex'),
        organizationId: orgB.id,
      },
    });
    await prisma.inbound.create({
      data: { tag: 'tenant-a-in', nodeId: nodeA.id, protocol: 'vless', port: 8443, settings: {} },
    });
    await prisma.inbound.create({
      data: { tag: 'tenant-b-in', nodeId: nodeB.id, protocol: 'vless', port: 8444, settings: {} },
    });
    await prisma.rule.create({
      data: { name: 'global-rule', type: 'field', payload: { name: 'global-rule' } },
    });
    await prisma.rule.create({
      data: {
        name: 'tenant-a-rule',
        type: 'field',
        payload: { name: 'tenant-a-rule' },
        organizationId: orgA.id,
      },
    });
    await prisma.rule.create({
      data: {
        name: 'tenant-b-rule',
        type: 'field',
        payload: { name: 'tenant-b-rule' },
        organizationId: orgB.id,
      },
    });

    const revisionA = await generator.createRevision(nodeA.id);
    const revisionB = await generator.createRevision(nodeB.id);
    const configA = JSON.parse(revisionA.content);
    const configB = JSON.parse(revisionB.content);
    const clients = (config: any) => config.inbounds[0].settings.clients.map((c: any) => c.email);
    const ruleNames = (config: any) => config.routing.rules.map((r: any) => r.name).filter(Boolean);

    expect(clients(configA)).toEqual([userA.email]);
    expect(clients(configB)).toEqual([userB.email]);
    expect(ruleNames(configA)).toEqual(['global-rule', 'tenant-a-rule']);
    expect(ruleNames(configB)).toEqual(['global-rule', 'tenant-b-rule']);
  });

  it('enforces RBAC and tenant boundaries for operators and users', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'RBAC A', slug: 'rbac-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'RBAC B', slug: 'rbac-b' } });
    const operator = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'rbac-operator@example.com', password, role: 'OPERATOR', organizationId: orgA.id }),
    ).expect(201);
    const userA = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'rbac-user-a@example.com', password, organizationId: orgA.id }),
    ).expect(201);
    await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'rbac-user-b@example.com', password, organizationId: orgB.id }),
    ).expect(201);

    const operatorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'rbac-operator@example.com', password })
      .expect(201);
    const userLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'rbac-user-a@example.com', password })
      .expect(201);
    const asOperator = (req: any) => req.set('Authorization', `Bearer ${operatorLogin.body.accessToken}`);
    const asUser = (req: any) => req.set('Authorization', `Bearer ${userLogin.body.accessToken}`);

    await asUser(request(app.getHttpServer()).get('/api/users')).expect(403);
    await asUser(request(app.getHttpServer()).get(`/api/users/${userA.body.id}`)).expect(403);

    await asOperator(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'rbac-intruder@example.com', password, organizationId: orgB.id }),
    ).expect(403);
    await asOperator(
      request(app.getHttpServer()).patch(`/api/users/${userA.body.id}`).send({ organizationId: orgB.id }),
    ).expect(403);
    await asOperator(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({ name: 'rbac-intruder-node', address: '127.0.0.1', organizationId: orgB.id }),
    ).expect(403);

    const scoped = await asOperator(request(app.getHttpServer()).get('/api/users?limit=100')).expect(200);
    expect(scoped.body.data.length).toBeGreaterThan(0);
    expect(scoped.body.data.every((u: { organizationId: string | null }) => u.organizationId === orgA.id)).toBe(true);

    for (const url of ['/api/audit', '/api/reports/organizations', '/api/traffic', '/api/payments']) {
      await asOperator(request(app.getHttpServer()).get(url)).expect(403);
    }

    await asOperator(request(app.getHttpServer()).get(`/api/users/${operator.body.id}`)).expect(200);
  });
});
