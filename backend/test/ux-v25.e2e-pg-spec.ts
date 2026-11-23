import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = [
  'AlertHistory',
  'AuditLog',
  'RefreshToken',
  'Payment',
  'SubscriptionPlan',
  'InboundFallback',
  'InboundClient',
  'Inbound',
  'ConfigRevision',
  'NodeMetric',
  'Node',
  'Host',
  'Rule',
  'UserTraffic',
  'User',
  'Organization',
];

describe('XSS API (e2e, PostgreSQL: v2.5 user onboarding)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
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
      .send({
        email: process.env.ADMIN_EMAIL || 'e2e-admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'e2e-password123',
      })
      .expect(201);
    token = login.body.accessToken;
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('creates a user, binds it through clients[], and shows it in the node config', async () => {
    const created = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'onboarding@example.com', password: 'onboarding-pass-123' }),
    ).expect(201);
    expect(created.body.subscriptionToken).toEqual(expect.any(String));

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'onboarding@example.com' } });
    expect(user.subscriptionToken).toBe(created.body.subscriptionToken);
    expect(user.status).toBe('ACTIVE');

    const node = await auth(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({ name: 'onboarding-node', address: '127.0.0.1', agentUrl: 'http://127.0.0.1:9' }),
    ).expect(201);
    expect(node.body.agentToken).toEqual(expect.any(String));

    const inbound = await auth(
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({
          tag: 'onboarding-trojan',
          nodeId: node.body.id,
          protocol: 'trojan',
          port: 8443,
          settings: {},
          clients: [{ userId: user.id, comment: 'v2.5 onboarding', enabled: true }],
        }),
    ).expect(201);
    const boundClient = await prisma.inboundClient.findFirstOrThrow({
      where: { inboundId: inbound.body.id, userId: user.id },
    });
    expect(boundClient).toMatchObject({ comment: 'v2.5 onboarding', enabled: true });

    const status = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.subscriptionToken}?format=json`)
      .expect(200);
    expect(status.body).toMatchObject({
      token: user.subscriptionToken,
      status: 'active',
      user: { id: user.id, email: user.email },
    });

    await auth(request(app.getHttpServer()).post(`/api/nodes/${node.body.id}/apply`).send({})).expect(201);

    const agentConfig = await request(app.getHttpServer())
      .get(`/api/nodes/${node.body.id}/config`)
      .set('Authorization', `Bearer ${node.body.agentToken}`)
      .expect(200);
    expect(agentConfig.body.config.inbounds[0].settings.clients).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: user.email, password: user.subscriptionToken })]),
    );
  });

  it('keeps another tenant out of the generated config and respects client limits', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Onboard A', slug: 'onboard-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Onboard B', slug: 'onboard-b' } });
    const userA = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'onboard-a@example.com', password: 'onboarding-pass-123', organizationId: orgA.id }),
    ).expect(201);
    const userB = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'onboard-b@example.com', password: 'onboarding-pass-123', organizationId: orgB.id }),
    ).expect(201);
    const disabled = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'onboard-disabled@example.com', password: 'onboarding-pass-123', organizationId: orgA.id }),
    ).expect(201);

    const node = await auth(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({ name: 'onboarding-tenant-node', address: '127.0.0.1', organizationId: orgA.id }),
    ).expect(201);
    await auth(
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({
          tag: 'onboarding-tenant-trojan',
          nodeId: node.body.id,
          protocol: 'trojan',
          port: 8444,
          settings: {},
          clients: [
            { userId: userA.body.id, enabled: true },
            { userId: disabled.body.id, enabled: false },
            { userId: userB.body.id, enabled: true },
          ],
        }),
    ).expect(201);

    await auth(request(app.getHttpServer()).post(`/api/nodes/${node.body.id}/apply`).send({})).expect(201);
    const agentConfig = await request(app.getHttpServer())
      .get(`/api/nodes/${node.body.id}/config`)
      .set('Authorization', `Bearer ${node.body.agentToken}`)
      .expect(200);
    const clients = agentConfig.body.config.inbounds[0].settings.clients;
    expect(clients).toEqual([expect.objectContaining({ email: userA.body.email })]);
    expect(JSON.stringify(clients)).not.toContain(userB.body.email);
    expect(JSON.stringify(clients)).not.toContain(disabled.body.email);
  });

  it('exposes a subscription link with the key when the inbound is bound to the user', async () => {
    const user = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'onboarding-link@example.com', password: 'onboarding-pass-123' }),
    ).expect(201);
    const node = await auth(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({ name: 'onboarding-link-node', address: 'node.example.com', agentUrl: 'http://127.0.0.1:9' }),
    ).expect(201);
    await auth(
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({
          tag: 'onboarding-link-trojan',
          nodeId: node.body.id,
          userId: user.body.id,
          protocol: 'trojan',
          port: 8445,
          settings: {},
          clients: [{ userId: user.body.id, enabled: true }],
        }),
    ).expect(201);

    const status = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.body.subscriptionToken}/json`)
      .expect(200);
    expect(status.body.links).toHaveLength(1);
    expect(status.body.links[0].link).toContain(user.body.subscriptionToken);

    const raw = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.body.subscriptionToken}/raw`)
      .expect(200);
    expect(raw.text).toContain(user.body.subscriptionToken);
  });
});
