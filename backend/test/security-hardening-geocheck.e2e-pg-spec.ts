import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QA v2.16/v2.17 issue 145: PostgreSQL e2e coverage for security hardening and
 * node geocheck. Exercises the real AppModule with its guards, roles, tenant
 * filters, node-token verification and metrics token gate.
 */
const TABLES = [
  'AlertHistory',
  'AuditLog',
  'NodeGeo',
  'RefreshToken',
  'Payment',
  'InboundClient',
  'InboundFallback',
  'Inbound',
  'ConfigRevision',
  'NodeMetric',
  'Node',
  'Host',
  'Rule',
  'Device',
  'UserTraffic',
  'User',
  'Organization',
];

describe('XSS security hardening and geocheck (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let operatorToken: string;
  let adminId: string;
  let orgAId: string;
  let orgBId: string;
  let nodeAId: string;
  const nodeToken = 'qa-node-token-value';
  const adminEmail = process.env.ADMIN_EMAIL || 'e2e-admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'e2e-password123';

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  const login = async (email: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
    return res.body.accessToken as string;
  };

  const auth = (token: string, req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const nodeAuth = (req: request.Test) => req.set('Authorization', `Bearer ${nodeToken}`);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for PostgreSQL e2e tests');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    adminToken = await login(adminEmail, adminPassword);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    adminId = admin.id;

    const orgA = await prisma.organization.create({ data: { name: 'Org A', slug: 'org-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B', slug: 'org-b' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const operator = await prisma.user.create({
      data: {
        email: 'e2e-operator@example.com',
        passwordHash: admin.passwordHash,
        role: 'OPERATOR',
        organizationId: orgAId,
      },
    });
    operatorToken = await login(operator.email, 'e2e-password123');

    const nodeA = await prisma.node.create({
      data: {
        name: 'node-a',
        address: '10.0.0.1',
        organizationId: orgAId,
        tokenHash: createHash('sha256').update(nodeToken).digest('hex'),
      },
    });
    nodeAId = nodeA.id;
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('denies OPERATOR changing an ADMIN password or any admin user field', async () => {
    await auth(
      operatorToken,
      request(app.getHttpServer()).patch(`/api/users/${adminId}`).send({ password: 'hacked-password-123' }),
    ).expect(403);

    const original = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    await auth(
      operatorToken,
      request(app.getHttpServer()).patch(`/api/users/${adminId}`).send({ trafficLimit: 123456 }),
    ).expect(403);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(after.passwordHash).toBe(original.passwordHash);
    expect(after.trafficLimit).toBe(original.trafficLimit);
  });

  it('isolates inbounds by organization: OPERATOR sees only own, ADMIN sees all', async () => {
    const nodeB = await prisma.node.create({
      data: { name: 'node-b', address: '10.0.0.2', organizationId: orgBId, tokenHash: 'hash-b' },
    });

    const own = await auth(
      operatorToken,
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({ tag: 'inbound-a', nodeId: nodeAId, protocol: 'vless', port: 443, settings: {} }),
    ).expect(201);
    expect(own.body.nodeId).toBe(nodeAId);

    await auth(
      operatorToken,
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({ tag: 'inbound-b', nodeId: nodeB.id, protocol: 'vless', port: 444, settings: {} }),
    ).expect(403);

    await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({ tag: 'inbound-b-admin', nodeId: nodeB.id, protocol: 'vless', port: 445, settings: {} }),
    ).expect(201);

    const operatorList = await auth(
      operatorToken,
      request(app.getHttpServer()).get('/api/inbounds'),
    ).expect(200);
    expect(operatorList.body.map((i: { tag: string }) => i.tag)).toEqual(['inbound-a']);

    const adminList = await auth(
      adminToken,
      request(app.getHttpServer()).get('/api/inbounds'),
    ).expect(200);
    expect(adminList.body.map((i: { tag: string }) => i.tag).sort()).toEqual([
      'inbound-a',
      'inbound-b-admin',
    ]);

    await auth(operatorToken, request(app.getHttpServer()).get(`/api/inbounds/${own.body.id}`)).expect(200);
    const foreign = adminList.body.find((i: { tag: string }) => i.tag === 'inbound-b-admin');
    await auth(operatorToken, request(app.getHttpServer()).get(`/api/inbounds/${foreign.id}`)).expect(404);
  });

  it('does not record traffic for users of another organization', async () => {
    const ownUser = await prisma.user.create({
      data: { email: 'own-user@example.com', passwordHash: 'x', organizationId: orgAId, subscriptionToken: 'qa-own' },
    });
    const foreignUser = await prisma.user.create({
      data: { email: 'foreign-user@example.com', passwordHash: 'x', organizationId: orgBId, subscriptionToken: 'qa-foreign' },
    });

    const own = await nodeAuth(
      request(app.getHttpServer())
        .post(`/api/nodes/${nodeAId}/traffic`)
        .send({ entries: [{ userId: ownUser.id, up: 100, down: 200 }] }),
    ).expect(201);
    expect(own.body).toMatchObject({ recorded: 1, skipped: 0 });

    const foreign = await nodeAuth(
      request(app.getHttpServer())
        .post(`/api/nodes/${nodeAId}/traffic`)
        .send({ entries: [{ userId: foreignUser.id, up: 999, down: 999 }] }),
    ).expect(201);
    expect(foreign.body).toMatchObject({ recorded: 0, skipped: 1 });

    const traffic = await prisma.userTraffic.findMany({
      where: { userId: { in: [ownUser.id, foreignUser.id] } },
    });
    expect(traffic).toHaveLength(1);
    expect(traffic[0].userId).toBe(ownUser.id);
    expect(Number(traffic[0].bytesUp)).toBe(100);
    expect(Number(traffic[0].bytesDown)).toBe(200);
  });

  it('gates GET /api/metrics behind METRICS_TOKEN in production', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedToken = process.env.METRICS_TOKEN;
    const token = 'qa-metrics-token-value';
    process.env.NODE_ENV = 'production';
    try {
      delete process.env.METRICS_TOKEN;
      const unconfigured = await request(app.getHttpServer()).get('/api/metrics').expect(503);
      expect(unconfigured.text).toContain('METRICS_TOKEN');

      process.env.METRICS_TOKEN = token;
      await request(app.getHttpServer()).get('/api/metrics').expect(403);
      await request(app.getHttpServer()).get('/api/metrics').set('x-metrics-token', 'wrong').expect(403);

      const ok = await request(app.getHttpServer())
        .get('/api/metrics')
        .set('x-metrics-token', token)
        .expect(200);
      expect(ok.headers['content-type']).toContain('text/plain');
      expect(ok.text).toContain('xray_users_total');
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedToken === undefined) delete process.env.METRICS_TOKEN;
      else process.env.METRICS_TOKEN = savedToken;
    }
  });

  it('accepts node geo with the node token and exposes it in GET /nodes', async () => {
    await request(app.getHttpServer())
      .post(`/api/nodes/${nodeAId}/geo`)
      .send({ countryCode: 'DE', city: 'Berlin' })
      .expect(401);

    const geo = await nodeAuth(
      request(app.getHttpServer())
        .post(`/api/nodes/${nodeAId}/geo`)
        .send({ ip: '203.0.113.7', countryCode: 'DE', city: 'Berlin' }),
    ).expect(201);
    expect(geo.body).toMatchObject({ countryCode: 'DE', city: 'Berlin' });
    expect(geo.body.tokenHash).toBeUndefined();

    const stored = await prisma.nodeGeo.findUniqueOrThrow({ where: { nodeId: nodeAId } });
    expect(stored).toMatchObject({ countryCode: 'DE', city: 'Berlin' });

    const list = await auth(adminToken, request(app.getHttpServer()).get('/api/nodes')).expect(200);
    const listed = list.body.find((n: { id: string }) => n.id === nodeAId);
    expect(listed).toBeTruthy();
    expect(listed.geo).toMatchObject({ countryCode: 'DE', city: 'Berlin' });
    expect(listed.tokenHash).toBeUndefined();

    const updated = await nodeAuth(
      request(app.getHttpServer())
        .post(`/api/nodes/${nodeAId}/geo`)
        .send({ countryCode: 'FR', city: 'Paris' }),
    ).expect(201);
    expect(updated.body).toMatchObject({ countryCode: 'FR', city: 'Paris' });
  });

  it('keeps legitimate agent flows working: config, traffic and metrics', async () => {
    const ownUser = await prisma.user.findFirstOrThrow({ where: { email: 'own-user@example.com' } });

    const config = await nodeAuth(
      request(app.getHttpServer()).get(`/api/nodes/${nodeAId}/config`),
    ).expect(200);
    expect(config.body.config).toBeTruthy();
    expect(config.body.version).toBeTruthy();

    const traffic = await nodeAuth(
      request(app.getHttpServer())
        .post(`/api/nodes/${nodeAId}/traffic`)
        .send({ entries: [{ userId: ownUser.id, up: 10, down: 20 }] }),
    ).expect(201);
    expect(traffic.body).toMatchObject({ recorded: 1, skipped: 0 });

    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      await request(app.getHttpServer()).get('/api/metrics').expect(200);
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
    }
  });
});
