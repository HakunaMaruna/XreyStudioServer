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
  'User',
  'Organization',
];

const PAYLOAD = {
  routingRules: [{ type: 'field', inboundTag: ['profile-in'], outboundTag: 'blocked' }],
  dnsServers: ['9.9.9.9'],
  outbounds: [{ tag: 'profile-out', protocol: 'freedom' }],
};

describe('XSS API (e2e, PostgreSQL: v2.7 config profiles)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'profiles-e2e-pass-123';
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

  const createProfile = async (name: string, payload: unknown = PAYLOAD) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/config-profiles')
        .send({ name, description: `${name} description`, payload }),
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

  const createNode = async (name: string, organizationId?: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({
          name,
          address: '127.0.0.1',
          agentUrl: 'http://127.0.0.1:9',
          ...(organizationId ? { organizationId } : {}),
        }),
    ).expect(201);
    return response.body;
  };

  const applyAndRead = async (node: { id: string; agentToken: string }) => {
    await auth(request(app.getHttpServer()).post(`/api/nodes/${node.id}/apply`).send({})).expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/nodes/${node.id}/config`)
      .set('Authorization', `Bearer ${node.agentToken}`)
      .expect(200);
    return response.body.config;
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

  it('creates, reads, updates and deletes a config profile', async () => {
    const initial = await auth(request(app.getHttpServer()).get('/api/config-profiles')).expect(200);
    expect(initial.body).toEqual([]);

    const created = await createProfile('profile-crud');
    expect(created).toMatchObject({ name: 'profile-crud', description: 'profile-crud description', enabled: true, payload: PAYLOAD });

    const list = await auth(request(app.getHttpServer()).get('/api/config-profiles')).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: created.id, _count: { users: 0 } });

    const found = await auth(request(app.getHttpServer()).get(`/api/config-profiles/${created.id}`)).expect(200);
    expect(found.body).toMatchObject({ id: created.id, name: 'profile-crud' });

    const updated = await auth(
      request(app.getHttpServer())
        .patch(`/api/config-profiles/${created.id}`)
        .send({ name: 'profile-renamed', description: 'new', payload: { routingRules: [] }, enabled: false }),
    ).expect(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      name: 'profile-renamed',
      description: 'new',
      payload: { routingRules: [] },
      enabled: false,
    });

    const persisted = await auth(request(app.getHttpServer()).get('/api/config-profiles')).expect(200);
    expect(persisted.body[0]).toMatchObject(updated.body);

    const removed = await auth(request(app.getHttpServer()).delete(`/api/config-profiles/${created.id}`)).expect(200);
    expect(removed.body).toEqual({ success: true });
    const missing = await auth(request(app.getHttpServer()).get(`/api/config-profiles/${created.id}`)).expect(200);
    expect(missing.body?.id).toBeUndefined();
    expect((await auth(request(app.getHttpServer()).get('/api/config-profiles')).expect(200)).body).toEqual([]);
  });

  it('restricts profile management to admins and operators', async () => {
    const org = await prisma.organization.create({ data: { name: 'Profiles RBAC', slug: 'profiles-rbac' } });
    await createUser('profiles-operator@example.com', org.id);
    await prisma.user.update({ where: { email: 'profiles-operator@example.com' }, data: { role: 'OPERATOR' } });
    await createUser('profiles-user@example.com', org.id);
    const operator = await login('profiles-operator@example.com');
    const regularUser = await login('profiles-user@example.com');
    const profile = await createProfile('profile-rbac');

    await request(app.getHttpServer()).get('/api/config-profiles').expect(401);
    await request(app.getHttpServer()).post('/api/config-profiles').send({ name: 'x', payload: {} }).expect(401);

    await auth(request(app.getHttpServer()).get('/api/config-profiles'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).post('/api/config-profiles').send({ name: 'x', payload: {} }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).patch(`/api/config-profiles/${profile.id}`).send({ enabled: false }), regularUser).expect(403);
    await auth(request(app.getHttpServer()).delete(`/api/config-profiles/${profile.id}`), regularUser).expect(403);

    expect((await auth(request(app.getHttpServer()).get('/api/config-profiles'), operator).expect(200)).body).toHaveLength(1);
    const byOperator = await auth(
      request(app.getHttpServer()).post('/api/config-profiles').send({ name: 'operator-profile', payload: {} }),
      operator,
    ).expect(201);
    expect(byOperator.body.name).toBe('operator-profile');
    await auth(request(app.getHttpServer()).patch(`/api/config-profiles/${byOperator.body.id}`).send({ enabled: false }), operator).expect(200);
    await auth(request(app.getHttpServer()).delete(`/api/config-profiles/${byOperator.body.id}`), operator).expect(200);
  });

  it('merges an attached profile into the generated node config', async () => {
    const profile = await createProfile('profile-merge');
    const user = await createUser('profile-merge@example.com');
    const patched = await auth(
      request(app.getHttpServer()).patch(`/api/users/${user.id}`).send({ configProfileId: profile.id }),
    ).expect(200);
    expect(patched.body.configProfileId).toBe(profile.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).configProfileId).toBe(profile.id);

    const node = await createNode('profile-merge-node');
    await auth(
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({
          tag: 'profile-merge-trojan',
          nodeId: node.id,
          protocol: 'trojan',
          port: 8501,
          settings: {},
          clients: [{ userId: user.id, enabled: true }],
        }),
    ).expect(201);

    const config = await applyAndRead(node);
    expect(config.routing.rules).toEqual(expect.arrayContaining([PAYLOAD.routingRules[0]]));
    expect(config.dns.servers).toEqual(expect.arrayContaining(['9.9.9.9']));
    expect(config.outbounds).toEqual(expect.arrayContaining([PAYLOAD.outbounds[0]]));
    expect(config.inbounds[0].settings.clients).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: user.email })]),
    );
    expect((await auth(request(app.getHttpServer()).get('/api/config-profiles')).expect(200)).body[0]).toMatchObject({
      id: profile.id,
      _count: { users: 1 },
    });
  });

  it('ignores disabled profiles, detaches users and scopes payloads to the node tenant', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Profiles A', slug: 'profiles-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Profiles B', slug: 'profiles-b' } });
    const profile = await createProfile('profile-tenant');
    const userA = await createUser('profile-tenant-a@example.com', orgA.id);
    await createUser('profile-tenant-b@example.com', orgB.id);
    await auth(request(app.getHttpServer()).patch(`/api/users/${userA.id}`).send({ configProfileId: profile.id })).expect(200);

    const nodeA = await createNode('profile-tenant-node-a', orgA.id);
    const nodeB = await createNode('profile-tenant-node-b', orgB.id);
    for (const [node, tag, port, email] of [
      [nodeA, 'profile-a-trojan', 8502, userA.email],
      [nodeB, 'profile-b-trojan', 8503, 'profile-tenant-b@example.com'],
    ] as const) {
      const tenantUser = await prisma.user.findUniqueOrThrow({ where: { email } });
      await auth(
        request(app.getHttpServer())
          .post('/api/inbounds')
          .send({
            tag,
            nodeId: node.id,
            protocol: 'trojan',
            port,
            settings: {},
            clients: [{ userId: tenantUser.id, enabled: true }],
          }),
      ).expect(201);
    }

    const configA = await applyAndRead(nodeA);
    expect(configA.routing.rules).toContainEqual(PAYLOAD.routingRules[0]);
    const configB = await applyAndRead(nodeB);
    expect(configB.routing.rules).not.toContainEqual(PAYLOAD.routingRules[0]);
    expect(configB.dns.servers).not.toContain('9.9.9.9');

    await auth(request(app.getHttpServer()).patch(`/api/config-profiles/${profile.id}`).send({ enabled: false })).expect(200);
    const disabledConfig = await applyAndRead(nodeA);
    expect(disabledConfig.routing.rules).not.toContainEqual(PAYLOAD.routingRules[0]);
    expect(disabledConfig.dns.servers).not.toContain('9.9.9.9');
    expect(disabledConfig.outbounds).not.toContainEqual(PAYLOAD.outbounds[0]);

    await auth(request(app.getHttpServer()).patch(`/api/config-profiles/${profile.id}`).send({ enabled: true })).expect(200);
    await auth(request(app.getHttpServer()).patch(`/api/users/${userA.id}`).send({ configProfileId: null })).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).configProfileId).toBeNull();
    const detachedConfig = await applyAndRead(nodeA);
    expect(detachedConfig.routing.rules).not.toContainEqual(PAYLOAD.routingRules[0]);
    expect(detachedConfig.dns.servers).not.toContain('9.9.9.9');
  });
});
