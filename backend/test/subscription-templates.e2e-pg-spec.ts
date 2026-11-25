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

const INSTRUCTIONS = [{ title: 'Connect', text: 'Use your subscription link' }];

describe('XSS API (e2e, PostgreSQL: v2.11 subscription templates)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'templates-e2e-pass-123';
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

  const createUser = async (email: string, organizationId?: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email, password, ...(organizationId ? { organizationId } : {}) }),
    ).expect(201);
    return response.body as { id: string; email: string; subscriptionToken: string };
  };

  const createTemplate = async (name: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/subscription-templates')
        .send({
          name,
          title: `${name} title`,
          description: `${name} description`,
          accent: '#112233',
          instructions: INSTRUCTIONS,
          footer: 'support@example.com',
        }),
    ).expect(201);
    return response.body as { id: string };
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

  it('creates, reads, updates and deletes a subscription template', async () => {
    expect((await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200)).body).toEqual([]);

    const created = await createTemplate('template-crud');
    expect(created).toMatchObject({
      name: 'template-crud',
      title: 'template-crud title',
      description: 'template-crud description',
      accent: '#112233',
      instructions: INSTRUCTIONS,
      footer: 'support@example.com',
      enabled: true,
    });

    const listed = await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({ id: created.id, _count: { users: 0 } });

    const found = await auth(request(app.getHttpServer()).get(`/api/subscription-templates/${created.id}`)).expect(200);
    expect(found.body).toMatchObject({ id: created.id, title: 'template-crud title' });

    const updated = await auth(
      request(app.getHttpServer())
        .patch(`/api/subscription-templates/${created.id}`)
        .send({ title: 'renamed title', accent: '#abcdef', instructions: [], enabled: false }),
    ).expect(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      name: 'template-crud',
      title: 'renamed title',
      accent: '#abcdef',
      instructions: [],
      enabled: false,
    });
    expect((await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200)).body[0]).toMatchObject({
      id: created.id,
      title: 'renamed title',
    });

    const removed = await auth(request(app.getHttpServer()).delete(`/api/subscription-templates/${created.id}`)).expect(200);
    expect(removed.body).toEqual({ success: true });
    await auth(request(app.getHttpServer()).get(`/api/subscription-templates/${created.id}`)).expect(404);
    expect((await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200)).body).toEqual([]);
  });

  it('applies an attached enabled template to the subscription and detaches on delete', async () => {
    const template = await createTemplate('template-subscription');
    const user = await createUser('template-user@example.com');
    const attached = await auth(
      request(app.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .send({ subscriptionTemplateId: template.id }),
    ).expect(200);
    expect(attached.body.subscriptionTemplateId).toBe(template.id);

    const subscription = `/api/subscriptions/${user.subscriptionToken}`;
    const withTemplate = await request(app.getHttpServer())
      .get(subscription)
      .query({ format: 'json' })
      .expect(200);
    expect(withTemplate.body.template).toMatchObject({
      title: 'template-subscription title',
      description: 'template-subscription description',
      accent: '#112233',
      instructions: INSTRUCTIONS,
      footer: 'support@example.com',
    });

    await auth(request(app.getHttpServer()).patch(`/api/subscription-templates/${template.id}`).send({ enabled: false })).expect(200);
    const disabled = await request(app.getHttpServer()).get(subscription).expect(200);
    expect(disabled.body.template).toBeNull();

    await auth(request(app.getHttpServer()).patch(`/api/subscription-templates/${template.id}`).send({ enabled: true })).expect(200);
    expect((await request(app.getHttpServer()).get(subscription).expect(200)).body.template).not.toBeNull();
    expect((await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200)).body[0]).toMatchObject({
      id: template.id,
      _count: { users: 1 },
    });

    await auth(request(app.getHttpServer()).delete(`/api/subscription-templates/${template.id}`)).expect(200);
    expect((await request(app.getHttpServer()).get(subscription).expect(200)).body.template).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscriptionTemplateId).toBeNull();
  });

  it('restricts template management to admins and operators', async () => {
    await createUser('template-user-role@example.com');
    const regularUser = await login('template-user-role@example.com');
    const template = await createTemplate('template-rbac');

    await request(app.getHttpServer()).get('/api/subscription-templates').expect(401);
    await request(app.getHttpServer()).post('/api/subscription-templates').send({ name: 'x', title: 'x' }).expect(401);

    await auth(request(app.getHttpServer()).get('/api/subscription-templates'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).get(`/api/subscription-templates/${template.id}`), regularUser).expect(403);
    await auth(
      request(app.getHttpServer()).post('/api/subscription-templates').send({ name: 'x', title: 'x' }),
      regularUser,
    ).expect(403);
    await auth(
      request(app.getHttpServer()).patch(`/api/subscription-templates/${template.id}`).send({ enabled: false }),
      regularUser,
    ).expect(403);
    await auth(request(app.getHttpServer()).delete(`/api/subscription-templates/${template.id}`), regularUser).expect(403);

    const operatorEmail = 'template-operator@example.com';
    await createUser(operatorEmail);
    await prisma.user.update({ where: { email: operatorEmail }, data: { role: 'OPERATOR' } });
    const operator = await login(operatorEmail);
    const byOperator = await auth(
      request(app.getHttpServer())
        .post('/api/subscription-templates')
        .send({ name: 'operator-template', title: 'Operator' }),
      operator,
    ).expect(201);
    expect(byOperator.body.name).toBe('operator-template');
    expect((await auth(request(app.getHttpServer()).get('/api/subscription-templates'), operator).expect(200)).body).toHaveLength(2);
  });

  it('isolates subscription templates by organization', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Templates iso A', slug: 'templates-iso-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Templates iso B', slug: 'templates-iso-b' } });
    await createUser('template-iso-operator@example.com', orgA.id);
    await prisma.user.update({ where: { email: 'template-iso-operator@example.com' }, data: { role: 'OPERATOR' } });
    const operator = await login('template-iso-operator@example.com');
    const userA = await createUser('template-iso-user-a@example.com', orgA.id);

    const own = await auth(
      request(app.getHttpServer())
        .post('/api/subscription-templates')
        .send({ name: 'template-iso-own', title: 'Own', instructions: INSTRUCTIONS }),
      operator,
    ).expect(201);
    expect(own.body.organizationId).toBe(orgA.id);

    const foreign = await auth(
      request(app.getHttpServer())
        .post('/api/subscription-templates')
        .send({ name: 'template-iso-foreign', title: 'Foreign', organizationId: orgB.id }),
    ).expect(201);

    await auth(
      request(app.getHttpServer())
        .post('/api/subscription-templates')
        .send({ name: 'template-iso-forged', title: 'Forged', organizationId: orgB.id }),
      operator,
    ).expect(403);

    const listed = await auth(request(app.getHttpServer()).get('/api/subscription-templates'), operator).expect(200);
    const visible = listed.body.map((template: { id: string }) => template.id);
    expect(visible).toContain(own.body.id);
    expect(visible).not.toContain(foreign.body.id);

    await auth(request(app.getHttpServer()).get(`/api/subscription-templates/${foreign.body.id}`), operator).expect(404);
    await auth(
      request(app.getHttpServer()).patch(`/api/subscription-templates/${foreign.body.id}`).send({ enabled: false }),
      operator,
    ).expect(404);
    await auth(
      request(app.getHttpServer()).delete(`/api/subscription-templates/${foreign.body.id}`),
      operator,
    ).expect(404);
    expect(await prisma.subscriptionTemplate.count({ where: { id: foreign.body.id } })).toBe(1);

    await auth(
      request(app.getHttpServer())
        .patch(`/api/users/${userA.id}`)
        .send({ subscriptionTemplateId: foreign.body.id }),
      operator,
    ).expect(403);

    const adminList = await auth(request(app.getHttpServer()).get('/api/subscription-templates')).expect(200);
    expect(adminList.body.map((template: { id: string }) => template.id)).toContain(foreign.body.id);
  });
});
