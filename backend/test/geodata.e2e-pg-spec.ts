import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GEODATA_CATALOG } from '../src/modules/geodata/catalog';
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

describe('XSS API (e2e, PostgreSQL: v2.13 geodata)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'geodata-e2e-pass-123';
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

  it('seeds the bundled catalog on startup and is idempotent', async () => {
    const listed = await auth(request(app.getHttpServer()).get('/api/geodata')).expect(200);
    expect(listed.body).toHaveLength(GEODATA_CATALOG.length);
    expect(listed.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'geosite', code: 'youtube', source: 'bundled', enabled: true }),
      expect.objectContaining({ type: 'geoip', code: 'ru', source: 'bundled', enabled: true }),
    ]));

    const seeded = await auth(request(app.getHttpServer()).post('/api/geodata/seed')).expect(201);
    expect(seeded.body).toEqual({ total: GEODATA_CATALOG.length, added: 0 });
    expect((await auth(request(app.getHttpServer()).get('/api/geodata')).expect(200)).body).toHaveLength(
      GEODATA_CATALOG.length,
    );
  });

  it('filters categories by type, search and enabled flag', async () => {
    const geosite = await auth(request(app.getHttpServer()).get('/api/geodata').query({ type: 'geosite' })).expect(200);
    expect(geosite.body).toHaveLength(GEODATA_CATALOG.filter((entry) => entry.type === 'geosite').length);
    expect(geosite.body.every((entry: { type: string }) => entry.type === 'geosite')).toBe(true);

    const searched = await auth(request(app.getHttpServer()).get('/api/geodata').query({ search: 'YOUTUBE' })).expect(200);
    expect(searched.body.map((entry: { code: string }) => entry.code)).toContain('youtube');

    const missing = await auth(request(app.getHttpServer()).get('/api/geodata').query({ search: 'no-such-category' })).expect(200);
    expect(missing.body).toEqual([]);

    expect((await auth(request(app.getHttpServer()).get('/api/geodata').query({ enabled: 'true' })).expect(200)).body).toHaveLength(
      GEODATA_CATALOG.length,
    );
    expect((await auth(request(app.getHttpServer()).get('/api/geodata').query({ enabled: 'false' })).expect(200)).body).toEqual([]);
  });

  it('creates, updates and deletes custom categories', async () => {
    const created = await auth(
      request(app.getHttpServer())
        .post('/api/geodata')
        .send({ type: 'geosite', code: 'My Custom!', name: 'My custom list', description: 'QA category' }),
    ).expect(201);
    expect(created.body).toMatchObject({
      type: 'geosite',
      code: 'mycustom',
      name: 'My custom list',
      description: 'QA category',
      source: 'custom',
      enabled: true,
    });

    await auth(
      request(app.getHttpServer())
        .post('/api/geodata')
        .send({ type: 'geosite', code: 'mycustom', name: 'Duplicate' }),
    ).expect(409);
    await auth(
      request(app.getHttpServer())
        .post('/api/geodata')
        .send({ type: 'dns', code: 'invalid-type', name: 'Invalid' }),
    ).expect(409);

    const updated = await auth(
      request(app.getHttpServer())
        .patch(`/api/geodata/${created.body.id}`)
        .send({ name: 'Renamed custom list', enabled: false }),
    ).expect(200);
    expect(updated.body).toMatchObject({ name: 'Renamed custom list', enabled: false, source: 'custom' });

    const disabled = await auth(request(app.getHttpServer()).get('/api/geodata').query({ enabled: 'false' })).expect(200);
    expect(disabled.body.map((entry: { id: string }) => entry.id)).toContain(created.body.id);

    const removed = await auth(request(app.getHttpServer()).delete(`/api/geodata/${created.body.id}`)).expect(200);
    expect(removed.body).toEqual({ success: true });
    await auth(request(app.getHttpServer()).patch(`/api/geodata/${created.body.id}`).send({ name: 'x' })).expect(404);
    await auth(request(app.getHttpServer()).delete(`/api/geodata/${created.body.id}`)).expect(404);
    expect((await auth(request(app.getHttpServer()).get('/api/geodata').query({ enabled: 'false' })).expect(200)).body).toEqual([]);
  });

  it('restricts the catalog to admins and operators', async () => {
    const created = await auth(
      request(app.getHttpServer()).post('/api/users').send({ email: 'geodata-user@example.com', password }),
    ).expect(201);
    const regularUser = await login('geodata-user@example.com');

    await request(app.getHttpServer()).get('/api/geodata').expect(401);
    await request(app.getHttpServer()).post('/api/geodata/seed').expect(401);
    await request(app.getHttpServer()).post('/api/geodata').send({ type: 'geosite', code: 'x', name: 'x' }).expect(401);

    await auth(request(app.getHttpServer()).get('/api/geodata'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).post('/api/geodata/seed'), regularUser).expect(403);
    await auth(
      request(app.getHttpServer()).post('/api/geodata').send({ type: 'geosite', code: 'x', name: 'x' }),
      regularUser,
    ).expect(403);
    await auth(request(app.getHttpServer()).patch(`/api/geodata/${created.body.id}`).send({ enabled: false }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).delete(`/api/geodata/${created.body.id}`), regularUser).expect(403);
  });
});
