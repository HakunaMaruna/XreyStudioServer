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
  'RoutingProfile',
  'InboundFallback',
  'InboundClient',
  'Inbound',
  'ConfigRevision',
  'NodeMetric',
  'Node',
  'Host',
  'Rule',
  'HealthCheck',
  'UserTraffic',
  'Device',
  'SubscriptionTemplate',
  'ConfigProfile',
  'Squad',
  'GeodataCategory',
  'User',
  'Organization',
];

describe('XSS API (e2e, PostgreSQL: v2.9 devices)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'devices-e2e-pass-123';
  const auth = (req: request.Test, bearer: string = token) => req.set('Authorization', `Bearer ${bearer}`);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  const login = async (email: string, secret: string = password) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: secret })
      .expect(201);
    return response.body.accessToken as string;
  };

  const createUser = async (email: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email, password }),
    ).expect(201);
    return response.body as { id: string; email: string; subscriptionToken: string };
  };

  const bind = (subscriptionToken: string, hwid: string, name?: string) =>
    request(app.getHttpServer())
      .post('/api/devices/bind')
      .send({ token: subscriptionToken, hwid, ...(name ? { name } : {}) });

  const listDevices = async (userId: string) =>
    auth(request(app.getHttpServer()).get('/api/devices').query({ userId })).expect(200);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL e2e tests');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    token = await login(process.env.ADMIN_EMAIL || 'e2e-admin@example.com', process.env.ADMIN_PASSWORD || 'e2e-password123');
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('binds by subscription token, lists, re-binds idempotently and removes devices', async () => {
    const user = await createUser('devices-bind@example.com');

    const bound = await bind(user.subscriptionToken, 'hwid-bind', 'Phone').expect(201);
    expect(bound.body).toMatchObject({ bound: true, hwid: 'hwid-bind', deviceLimit: 0 });

    const listed = await listDevices(user.id);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      hwid: 'hwid-bind',
      name: 'Phone',
      user: { id: user.id, email: user.email },
    });

    await bind(user.subscriptionToken, 'hwid-bind', 'Renamed phone').expect(201);
    expect((await listDevices(user.id)).body).toHaveLength(1);
    expect((await listDevices(user.id)).body[0].name).toBe('Renamed phone');

    const added = await auth(
      request(app.getHttpServer())
        .post('/api/devices')
        .send({ userId: user.id, hwid: 'hwid-admin', name: 'Laptop' }),
    ).expect(201);
    expect(added.body).toMatchObject({ userId: user.id, hwid: 'hwid-admin' });
    expect((await listDevices(user.id)).body).toHaveLength(2);

    await bind('missing-token', 'hwid-missing').expect(404);
    expect((await auth(request(app.getHttpServer()).get('/api/devices')).expect(200)).body).toHaveLength(2);

    const removed = await auth(request(app.getHttpServer()).delete(`/api/devices/${added.body.id}`)).expect(200);
    expect(removed.body).toEqual({ success: true });
    expect((await listDevices(user.id)).body.map((d: { hwid: string }) => d.hwid)).toEqual(['hwid-bind']);
    await auth(request(app.getHttpServer()).delete(`/api/devices/${added.body.id}`)).expect(404);

    const disabled = await createUser('devices-disabled@example.com');
    await auth(
      request(app.getHttpServer()).patch(`/api/users/${disabled.id}`).send({ status: 'DISABLED' }),
    ).expect(200);
    await bind(disabled.subscriptionToken, 'hwid-disabled').expect(403);
  });

  it('enforces the configured device limit on bind and on subscription requests with hwid', async () => {
    const user = await createUser('devices-limit@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { deviceLimit: 2 } });

    for (const hwid of ['hwid-limit-1', 'hwid-limit-2']) {
      const bound = await bind(user.subscriptionToken, hwid).expect(201);
      expect(bound.body.deviceLimit).toBe(2);
    }
    await bind(user.subscriptionToken, 'hwid-limit-3').expect(403);
    expect((await listDevices(user.id)).body).toHaveLength(2);

    const subscription = `/api/subscriptions/${user.subscriptionToken}`;
    const allowed = await request(app.getHttpServer())
      .get(subscription)
      .query({ format: 'json', hwid: 'hwid-limit-1' })
      .expect(200);
    expect(allowed.body).toMatchObject({ deviceLimit: 2, deviceCount: 2 });
    expect(allowed.body.deviceIds).toEqual(expect.arrayContaining(['hwid-limit-1', 'hwid-limit-2']));
    const touched = await prisma.device.findUniqueOrThrow({ where: { hwid: 'hwid-limit-1' } });
    expect(touched.lastSeenAt).not.toBeNull();

    await request(app.getHttpServer())
      .get(subscription)
      .query({ format: 'json', hwid: 'hwid-limit-3' })
      .expect(403);
    await request(app.getHttpServer()).get(subscription).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('ACTIVE');
  });

  it('does not hand a hwid already owned by another user to a second subscription', async () => {
    const first = await createUser('devices-owner-a@example.com');
    const second = await createUser('devices-owner-b@example.com');
    await bind(first.subscriptionToken, 'hwid-shared').expect(201);

    const denied = await bind(second.subscriptionToken, 'hwid-shared');
    expect(denied.status).toBe(403);
    expect((await listDevices(first.id)).body).toHaveLength(1);
    expect((await listDevices(second.id)).body).toEqual([]);
  });

  it('restricts device management to admins and operators', async () => {
    await createUser('devices-user@example.com');
    const regularUser = await login('devices-user@example.com');

    await request(app.getHttpServer()).get('/api/devices').expect(401);
    await request(app.getHttpServer()).post('/api/devices').send({ userId: 'x', hwid: 'x' }).expect(401);
    await request(app.getHttpServer()).delete('/api/devices/x').expect(401);
    await auth(request(app.getHttpServer()).get('/api/devices'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).post('/api/devices').send({ userId: 'x', hwid: 'x' }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).delete('/api/devices/x'), regularUser).expect(403);
  });
});
