import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
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
  'User',
  'Squad',
  'Organization',
  'Node',
  'ConfigProfile',
];


describe('XSS API (e2e, PostgreSQL: bulk inbound users)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = `e2e-${randomUUID()}`;
  const auth = (req: request.Test, bearer: string = token) => req.set('Authorization', `Bearer ${bearer}`);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  const createUser = async (email: string, telegramId?: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email, password, ...(telegramId ? { telegramId } : {}) }),
    ).expect(201);
    return response.body;
  };

  const bulk = (inboundId: string, body: Record<string, unknown>) =>
    auth(request(app.getHttpServer()).post(`/api/inbounds/${inboundId}/users/bulk`).send(body));

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL e2e tests');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: process.env.ADMIN_EMAIL || 'e2e-admin@example.com', password: process.env.ADMIN_PASSWORD || 'e2e-password123' })
      .expect(201);
    token = response.body.accessToken as string;
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('adds and removes selected users idempotently', async () => {
    const inbound = await prisma.inbound.create({
      data: { tag: 'bulk-selected', protocol: 'vless', transport: 'tcp', security: 'none', port: 443, settings: {}, enabled: true },
    });
    const first = await createUser('bulk-first@example.com');
    const second = await createUser('bulk-second@example.com', '123456789');
    expect(second.telegramId).toBe('123456789');

    const added = await bulk(inbound.id, { mode: 'add', scope: 'selected', userIds: [first.id, second.id] }).expect(201);
    expect(added.body).toMatchObject({ affected: 2, skipped: 0, targetCount: 2 });
    expect(await prisma.inboundClient.count({ where: { inboundId: inbound.id } })).toBe(2);

    const repeated = await bulk(inbound.id, { mode: 'add', scope: 'selected', userIds: [first.id, second.id] }).expect(201);
    expect(repeated.body).toMatchObject({ affected: 0, skipped: 2 });

    const removed = await bulk(inbound.id, { mode: 'remove', scope: 'selected', userIds: [first.id] }).expect(201);
    expect(removed.body).toMatchObject({ affected: 1, skipped: 0 });
    expect(await prisma.inboundClient.count({ where: { inboundId: inbound.id } })).toBe(1);
  });

  it('adds and removes a whole squad and all users', async () => {
    const inbound = await prisma.inbound.create({
      data: { tag: 'bulk-squad', protocol: 'vless', transport: 'tcp', security: 'none', port: 444, settings: {}, enabled: true },
    });
    const squadResponse = await auth(request(app.getHttpServer()).post('/api/squads').send({ name: 'bulk-squad', description: 'bulk squad' })).expect(201);
    const memberA = await createUser('bulk-squad-a@example.com');
    const memberB = await createUser('bulk-squad-b@example.com');
    await auth(request(app.getHttpServer()).patch(`/api/users/${memberA.id}`).send({ squadId: squadResponse.body.id })).expect(200);
    await auth(request(app.getHttpServer()).patch(`/api/users/${memberB.id}`).send({ squadId: squadResponse.body.id })).expect(200);

    const bySquad = await bulk(inbound.id, { mode: 'add', scope: 'squad', squadId: squadResponse.body.id }).expect(201);
    expect(bySquad.body).toMatchObject({ affected: 2, skipped: 0 });
    expect(await prisma.inboundClient.count({ where: { inboundId: inbound.id } })).toBe(2);

    const removeBySquad = await bulk(inbound.id, { mode: 'remove', scope: 'squad', squadId: squadResponse.body.id }).expect(201);
    expect(removeBySquad.body).toMatchObject({ affected: 2, skipped: 0 });

    const all = await bulk(inbound.id, { mode: 'add', scope: 'all' }).expect(201);
    expect(all.body.affected).toBeGreaterThanOrEqual(2);
    const detachAll = await bulk(inbound.id, { mode: 'remove', scope: 'all' }).expect(201);
    expect(detachAll.body.affected).toBe(all.body.affected);
    expect(await prisma.inboundClient.count({ where: { inboundId: inbound.id } })).toBe(0);
  });

  it('rejects invalid bulk input', async () => {
    const inbound = await prisma.inbound.create({
      data: { tag: 'bulk-invalid', protocol: 'vless', transport: 'tcp', security: 'none', port: 445, settings: {}, enabled: true },
    });
    await bulk(inbound.id, { mode: 'add', scope: 'selected', userIds: ['not-a-uuid'] }).expect(400);
    await bulk(inbound.id, { mode: 'add', scope: 'squad' }).expect(400);
    await bulk(inbound.id, { mode: 'add', scope: 'unknown' }).expect(400);
    const user = await createUser('bulk-invalid-telegram@example.com');
    await auth(request(app.getHttpServer()).patch(`/api/users/${user.id}`).send({ telegramId: 'abc' })).expect(400);
  });
});
