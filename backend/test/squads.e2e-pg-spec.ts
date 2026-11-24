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
  'UserTraffic',
  'ConfigProfile',
  'Squad',
  'User',
  'Organization',
];

describe('XSS API (e2e, PostgreSQL: v2.8 squads)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'squads-e2e-pass-123';
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

  const createSquad = async (name: string, extra: Record<string, unknown> = {}) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/squads')
        .send({ name, description: `${name} description`, ...extra }),
    ).expect(201);
    return response.body;
  };

  const createUser = async (email: string, organizationId?: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email, password, ...(organizationId ? { organizationId } : {}) }),
    ).expect(201);
    return response.body;
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

  it('creates, reads, updates and deletes a squad', async () => {
    expect((await auth(request(app.getHttpServer()).get('/api/squads')).expect(200)).body).toEqual([]);

    const created = await createSquad('squad-crud', {
      trafficLimit: 1000,
      expiresAt: '2030-01-02T03:04:05.000Z',
    });
    expect(created).toMatchObject({
      name: 'squad-crud',
      description: 'squad-crud description',
      enabled: true,
    });
    expect(String(created.trafficLimit)).toBe('1000');

    const list = await auth(request(app.getHttpServer()).get('/api/squads')).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: created.id, _count: { users: 0 } });

    const found = await auth(request(app.getHttpServer()).get(`/api/squads/${created.id}`)).expect(200);
    expect(found.body).toMatchObject({ id: created.id, name: 'squad-crud' });
    expect(found.body.users).toEqual([]);

    const updated = await auth(
      request(app.getHttpServer())
        .patch(`/api/squads/${created.id}`)
        .send({ name: 'squad-renamed', description: 'new', trafficLimit: 2000, expiresAt: null, enabled: false }),
    ).expect(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      name: 'squad-renamed',
      description: 'new',
      enabled: false,
      expiresAt: null,
    });
    expect(String(updated.body.trafficLimit)).toBe('2000');
    expect((await auth(request(app.getHttpServer()).get('/api/squads')).expect(200)).body[0]).toMatchObject({
      id: created.id,
      name: 'squad-renamed',
    });

    expect((await auth(request(app.getHttpServer()).delete(`/api/squads/${created.id}`)).expect(200)).body).toEqual({
      success: true,
    });
    await auth(request(app.getHttpServer()).get(`/api/squads/${created.id}`)).expect(404);
    expect((await auth(request(app.getHttpServer()).get('/api/squads')).expect(200)).body).toEqual([]);
  });

  it('restricts squad management to admins and operators', async () => {
    const org = await prisma.organization.create({ data: { name: 'Squads RBAC', slug: 'squads-rbac' } });
    await createUser('squads-operator@example.com', org.id);
    await prisma.user.update({ where: { email: 'squads-operator@example.com' }, data: { role: 'OPERATOR' } });
    await createUser('squads-user@example.com', org.id);
    const operator = await login('squads-operator@example.com');
    const regularUser = await login('squads-user@example.com');
    const squad = await createSquad('squad-rbac');

    await request(app.getHttpServer()).get('/api/squads').expect(401);
    await request(app.getHttpServer()).post('/api/squads').send({ name: 'x' }).expect(401);

    await auth(request(app.getHttpServer()).get('/api/squads'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).post('/api/squads').send({ name: 'x' }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).patch(`/api/squads/${squad.id}`).send({ enabled: false }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).patch(`/api/squads/${squad.id}/members`).send({ userIds: [] }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).delete(`/api/squads/${squad.id}`), regularUser).expect(403);

    expect((await auth(request(app.getHttpServer()).get('/api/squads'), operator).expect(200)).body).toHaveLength(1);
    const byOperator = await auth(
      request(app.getHttpServer()).post('/api/squads').send({ name: 'operator-squad' }),
      operator,
    ).expect(201);
    await auth(request(app.getHttpServer()).patch(`/api/squads/${byOperator.body.id}`).send({ enabled: false }), operator).expect(200);
    await auth(request(app.getHttpServer()).delete(`/api/squads/${byOperator.body.id}`), operator).expect(200);
  });

  it('replaces members and supports attaching a user through PATCH /users/:id', async () => {
    const squad = await createSquad('squad-members');
    const userA = await createUser('squad-member-a@example.com');
    const userB = await createUser('squad-member-b@example.com');
    const userC = await createUser('squad-member-c@example.com');

    const first = await auth(
      request(app.getHttpServer()).patch(`/api/squads/${squad.id}/members`).send({ userIds: [userA.id, userB.id] }),
    ).expect(200);
    expect(first.body.users).toHaveLength(2);
    expect(first.body.users.map((u: { id: string }) => u.id).sort()).toEqual([userA.id, userB.id].sort());
    expect((await auth(request(app.getHttpServer()).get('/api/squads')).expect(200)).body[0]).toMatchObject({
      id: squad.id,
      _count: { users: 2 },
    });

    const second = await auth(
      request(app.getHttpServer()).patch(`/api/squads/${squad.id}/members`).send({ userIds: [userB.id, userC.id] }),
    ).expect(200);
    expect(second.body.users.map((u: { id: string }) => u.id).sort()).toEqual([userB.id, userC.id].sort());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).squadId).toBeNull();

    const attached = await auth(
      request(app.getHttpServer()).patch(`/api/users/${userA.id}`).send({ squadId: squad.id }),
    ).expect(200);
    expect(attached.body.squadId).toBe(squad.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).squadId).toBe(squad.id);
    expect((await auth(request(app.getHttpServer()).get(`/api/squads/${squad.id}`)).expect(200)).body.users).toHaveLength(3);

    const detached = await auth(
      request(app.getHttpServer()).patch(`/api/users/${userA.id}`).send({ squadId: null }),
    ).expect(200);
    expect(detached.body.squadId).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).squadId).toBeNull();
    await auth(request(app.getHttpServer()).patch(`/api/squads/${squad.id}/members`).send({})).expect(200);
    expect((await auth(request(app.getHttpServer()).get(`/api/squads/${squad.id}`)).expect(200)).body.users).toEqual([]);
  });

  it('keeps cross-tenant user updates out of an operator scope', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Squads A', slug: 'squads-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Squads B', slug: 'squads-b' } });
    await createUser('squads-tenant-operator@example.com', orgA.id);
    await prisma.user.update({ where: { email: 'squads-tenant-operator@example.com' }, data: { role: 'OPERATOR' } });
    const operator = await login('squads-tenant-operator@example.com');
    const userA = await createUser('squads-tenant-a@example.com', orgA.id);
    const userB = await createUser('squads-tenant-b@example.com', orgB.id);
    const squad = await createSquad('squad-tenant');

    const own = await auth(request(app.getHttpServer()).patch(`/api/users/${userA.id}`).send({ squadId: squad.id }), operator).expect(200);
    expect(own.body.squadId).toBe(squad.id);

    await auth(request(app.getHttpServer()).patch(`/api/users/${userB.id}`).send({ squadId: squad.id }), operator).expect(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userB.id } })).squadId).toBeNull();
    await auth(request(app.getHttpServer()).get(`/api/users/${userB.id}`), operator).expect(404);
    expect((await auth(request(app.getHttpServer()).get(`/api/squads/${squad.id}`)).expect(200)).body.users.map(
      (u: { id: string }) => u.id,
    )).toEqual([userA.id]);
  });
});
