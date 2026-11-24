import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QA: scoped API tokens и event-level notification routing.
 * Запуск: npm run test:e2e:pg (реальный PostgreSQL, см. test/setup-env-pg.js).
 */
describe('Scoped API tokens и notification routes (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken: string;
  let operatorToken: string;
  let outsiderToken: string;

  const TABLES = [
    'AlertHistory',
    'AuditLog',
    'ApiToken',
    'NotificationRoute',
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

  const auth = (token: string, r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }

    await prisma.organization.create({
      data: { id: 'tokens-org-a', name: 'Tokens Org A', slug: 'tokens-org-a' },
    });
    await prisma.organization.create({
      data: { id: 'tokens-org-b', name: 'Tokens Org B', slug: 'tokens-org-b' },
    });

    const admin = await prisma.user.create({
      data: {
        id: 'tokens-admin',
        email: 'tokens-admin@example.com',
        passwordHash: 'hash',
        role: 'ADMIN',
        organizationId: 'tokens-org-a',
      },
    });
    const operator = await prisma.user.create({
      data: {
        id: 'tokens-operator',
        email: 'tokens-operator@example.com',
        passwordHash: 'hash',
        role: 'OPERATOR',
        organizationId: 'tokens-org-a',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        id: 'tokens-outsider',
        email: 'tokens-outsider@example.com',
        passwordHash: 'hash',
        role: 'OPERATOR',
        organizationId: 'tokens-org-b',
      },
    });
    adminToken = jwt.sign({ sub: admin.id, userId: admin.id, role: 'ADMIN' });
    operatorToken = jwt.sign({
      sub: operator.id,
      userId: operator.id,
      role: 'OPERATOR',
      organizationId: 'tokens-org-a',
    });
    outsiderToken = jwt.sign({
      sub: outsider.id,
      userId: outsider.id,
      role: 'OPERATOR',
      organizationId: 'tokens-org-b',
    });
  });

  afterAll(async () => {
    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    await app.close();
  });

  it('creates a scoped token, returns the raw value only once and stores only its hash', async () => {
    const response = await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'Grafana', scopes: ['MONITOR'] }),
    ).expect(201);

    expect(response.body.token).toMatch(/^xss_[a-f0-9]{64}$/);
    expect(response.body.scopes).toEqual(['MONITOR']);
    expect(response.body.name).toBe('Grafana');

    const stored = await prisma.apiToken.findUnique({ where: { id: response.body.id } });
    expect(stored?.tokenHash).not.toBe(response.body.token);
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const list = await auth(adminToken, request(app.getHttpServer()).get('/api/api-tokens')).expect(200);
    expect(list.body.some((t: { token?: string }) => Boolean(t.token))).toBe(false);
  });

  it('serves /api/monitor/summary with a MONITOR token without a JWT', async () => {
    const created = await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'monitor2', scopes: ['MONITOR'] }),
    ).expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/monitor/summary')
      .set('X-API-Token', created.body.token)
      .expect(200);
    expect(response.body).toHaveProperty('users');
    expect(response.body).toHaveProperty('nodes');
    expect(response.body).toHaveProperty('generatedAt');

    const used = await prisma.apiToken.findUnique({ where: { id: created.body.id } });
    expect(used?.lastUsedAt).toBeTruthy();
  });

  it('rejects missing, malformed and revoked tokens', async () => {
    await request(app.getHttpServer()).get('/api/monitor/summary').expect(401);
    await request(app.getHttpServer())
      .get('/api/monitor/summary')
      .set('X-API-Token', 'not-a-token')
      .expect(401);

    const created = await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'revoked', scopes: ['MONITOR'] }),
    ).expect(201);

    await auth(adminToken, request(app.getHttpServer()).delete(`/api/api-tokens/${created.body.id}`)).expect(200);
    await request(app.getHttpServer())
      .get('/api/monitor/summary')
      .set('X-API-Token', created.body.token)
      .expect(401);
  });

  it('enforces scope: NODE_SYNC token cannot read monitor summary', async () => {
    const created = await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'node-sync', scopes: ['NODE_SYNC'] }),
    ).expect(201);

    await request(app.getHttpServer())
      .get('/api/monitor/summary')
      .set('X-API-Token', created.body.token)
      .expect(403);
  });

  it('isolates tenants: OPERATOR cannot list or revoke another organization tokens', async () => {
    const created = await auth(
      outsiderToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'org-b', scopes: ['MONITOR'] }),
    ).expect(201);

    const list = await auth(operatorToken, request(app.getHttpServer()).get('/api/api-tokens')).expect(200);
    expect(list.body.some((t: { id: string }) => t.id === created.body.id)).toBe(false);

    const ownList = await auth(outsiderToken, request(app.getHttpServer()).get('/api/api-tokens')).expect(200);
    expect(ownList.body.some((t: { id: string }) => t.id === created.body.id)).toBe(true);

    await auth(operatorToken, request(app.getHttpServer()).delete(`/api/api-tokens/${created.body.id}`)).expect(404);
    await auth(outsiderToken, request(app.getHttpServer()).delete(`/api/api-tokens/${created.body.id}`)).expect(200);
    const after = await prisma.apiToken.findUnique({ where: { id: created.body.id } });
    expect(after?.revokedAt).toBeTruthy();
  });

  it('does not allow OPERATOR to mint USERS_READ tokens', async () => {
    await auth(
      operatorToken,
      request(app.getHttpServer())
        .post('/api/api-tokens')
        .send({ name: 'escalation', scopes: ['USERS_READ'] }),
    ).expect(400);
  });

  it('sets and lists event-level notification routes with tenant isolation', async () => {
    await auth(
      adminToken,
      request(app.getHttpServer())
        .post('/api/notification-routes')
        .send({ event: 'NODE_OFFLINE', channel: 'TELEGRAM', enabled: true }),
    ).expect(201);

    const routes = await auth(adminToken, request(app.getHttpServer()).get('/api/notification-routes')).expect(200);
    expect(routes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'NODE_OFFLINE', channel: 'TELEGRAM', enabled: true }),
      ]),
    );

    const saved = await prisma.notificationRoute.findFirst({ where: { event: 'NODE_OFFLINE' } });
    expect(saved?.organizationId).toBeNull();

    const orgList = await auth(operatorToken, request(app.getHttpServer()).get('/api/notification-routes')).expect(200);
    expect(orgList.body.every((r: { organizationId: string | null }) => r.organizationId === 'tokens-org-a')).toBe(true);
  });
});
