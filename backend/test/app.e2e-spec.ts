import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/common/seed.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('XSS API (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: bcrypt.hashSync('password123', 4),
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationId: null,
    expiresAt: null,
  };

  const prisma: any = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(admin),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { trafficUsed: 0n } }),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    refreshToken: { create: jest.fn().mockResolvedValue({}), delete: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
    host: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'host-1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'host-1', ...data })),
      delete: jest.fn(),
    },
    rule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rule-1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rule-1', ...data })),
      delete: jest.fn(),
    },
    node: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    nodeMetric: { findMany: jest.fn().mockResolvedValue([]) },
    configRevision: { findMany: jest.fn().mockResolvedValue([{ id: 'rev-1', version: 1, applied: true, createdAt: new Date() }]) },
    payment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    alertHistory: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'alert-1', ...data })),
      findMany: jest.fn().mockResolvedValue([
        { id: 'alert-1', status: 'firing', title: 'XSS node offline', source: 'grafana', createdAt: new Date() },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SeedService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.email === admin.email || where.id === admin.id ? admin : null),
    );

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'password123' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes public health endpoint', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'wrong-password' })
      .expect(401);
  });

  it('paginates users on the server', async () => {
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'u1', email: 'u1@example.com', role: 'USER', status: 'ACTIVE' },
    ]);
    const res = await request(app.getHttpServer())
      .get('/api/users?page=2&limit=1&search=u1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ page: 2, limit: 1, total: 1 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1, where: expect.objectContaining({ email: { contains: 'u1', mode: 'insensitive' } }) }),
    );
  });

  it('validates and creates a host', async () => {
    await request(app.getHttpServer())
      .post('/api/hosts')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: 'example.com' })
      .expect(400);
    const res = await request(app.getHttpServer())
      .post('/api/hosts')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: 'example.com', port: 443 })
      .expect(201);
    expect(res.body).toMatchObject({ id: 'host-1', address: 'example.com', port: 443, enabled: true });
  });

  it('validates and creates a rule', async () => {
    await request(app.getHttpServer())
      .post('/api/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'bad', type: 'field', payload: 'not-an-object' })
      .expect(400);
    const res = await request(app.getHttpServer())
      .post('/api/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'direct', type: 'field', payload: { outboundTag: 'direct' } })
      .expect(201);
    expect(res.body).toMatchObject({ id: 'rule-1', name: 'direct', enabled: true });
  });

  it('lists node config revisions', async () => {
    prisma.node.findFirst.mockResolvedValueOnce({ id: 'node-1' });
    const res = await request(app.getHttpServer())
      .get('/api/nodes/node-1/revisions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body[0]).toMatchObject({ id: 'rev-1', version: 1, applied: true });
  });

  it('authorizes the Grafana alert webhook with a shared token', async () => {
    const payload = { status: 'firing', alerts: [{ status: 'firing', labels: { alertname: 'XSS node offline' } }] };
    delete process.env.ALERT_WEBHOOK_TOKEN;
    await request(app.getHttpServer()).post('/api/notifications/alerts').send(payload).expect(503);
    process.env.ALERT_WEBHOOK_TOKEN = 'e2e-alert-token';
    await request(app.getHttpServer())
      .post('/api/notifications/alerts')
      .set('Authorization', 'Bearer wrong-token')
      .send(payload)
      .expect(401);
    const res = await request(app.getHttpServer())
      .post('/api/notifications/alerts')
      .set('Authorization', 'Bearer e2e-alert-token')
      .send(payload)
      .expect(201);
    expect(res.body.received).toBe(1);
    expect(res.body.persisted).toBe(1);
    expect(prisma.alertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'firing', title: 'XSS node offline', source: 'grafana' }),
      }),
    );
    delete process.env.ALERT_WEBHOOK_TOKEN;
  });

  it('returns alert history and channel status to admins', async () => {
    const history = await request(app.getHttpServer())
      .get('/api/notifications/alerts?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body).toMatchObject({ page: 1, limit: 10, total: 1 });
    expect(history.body.data[0]).toMatchObject({ id: 'alert-1', title: 'XSS node offline' });

    const channels = await request(app.getHttpServer())
      .get('/api/notifications/channels')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(channels.body).toHaveProperty('telegram');
    expect(channels.body).toHaveProperty('signal');
  });
});
