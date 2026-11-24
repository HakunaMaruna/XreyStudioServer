import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo, createServer, Server } from 'net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HealthChecksService } from '../src/modules/health-checks/health-checks.service';
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

describe('XSS API (e2e, PostgreSQL: v2.10 health checks)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let listener: Server | undefined;
  const password = 'health-e2e-pass-123';
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
      request(app.getHttpServer()).post('/api/users').send({ email, password }),
    ).expect(201);
    return response.body as { id: string; email: string };
  };

  const createNode = async (name: string) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/nodes')
        .send({ name, address: '127.0.0.1', agentUrl: 'http://127.0.0.1:9' }),
    ).expect(201);
    return response.body as { id: string };
  };

  const createInbound = async (nodeId: string, tag: string, port: number) => {
    const response = await auth(
      request(app.getHttpServer())
        .post('/api/inbounds')
        .send({ tag, nodeId, protocol: 'trojan', port, settings: { publicHost: '127.0.0.1' } }),
    ).expect(201);
    return response.body as { id: string };
  };

  const freePort = async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
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

  afterEach(async () => {
    if (listener?.listening) {
      await new Promise<void>((resolve) => listener!.close(() => resolve()));
    }
    listener = undefined;
  });

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('records a background client-eye check for reachable and unreachable inbounds', async () => {
    listener = createServer();
    await new Promise<void>((resolve) => listener!.listen(0, '127.0.0.1', resolve));
    const openPort = (listener.address() as AddressInfo).port;
    const closedPort = await freePort();

    const node = await createNode('health-probe-node');
    const reachable = await createInbound(node.id, 'health-probe-open', openPort);
    const unreachable = await createInbound(node.id, 'health-probe-closed', closedPort);

    await app.get(HealthChecksService).run();

    const listed = await auth(
      request(app.getHttpServer()).get('/api/health-checks').query({ nodeId: node.id }),
    ).expect(200);
    const ok = listed.body.find((entry: { inboundId: string }) => entry.inboundId === reachable.id);
    const failed = listed.body.find((entry: { inboundId: string }) => entry.inboundId === unreachable.id);
    expect(ok).toMatchObject({
      nodeId: node.id,
      tag: 'health-probe-open',
      host: '127.0.0.1',
      port: openPort,
      success: true,
      node: { id: node.id, name: 'health-probe-node' },
    });
    expect(ok.latencyMs).toBeGreaterThanOrEqual(0);
    expect(failed).toMatchObject({
      nodeId: node.id,
      tag: 'health-probe-closed',
      port: closedPort,
      success: false,
    });
    expect(failed.error).toBeTruthy();
  });

  it('filters the check history by node and limit and exposes latest', async () => {
    const nodeA = await createNode('health-history-a');
    const nodeB = await createNode('health-history-b');
    const base = Date.now() - 60_000;
    await prisma.healthCheck.createMany({
      data: [
        ...[0, 1, 2].map((i) => ({
          nodeId: nodeA.id,
          tag: `a-${i}`,
          protocol: 'trojan',
          host: '127.0.0.1',
          port: 9000 + i,
          success: true,
          latencyMs: i,
          checkedAt: new Date(base + i * 1000),
        })),
        {
          nodeId: nodeB.id,
          tag: 'b-0',
          protocol: 'trojan',
          host: '127.0.0.1',
          port: 9100,
          success: false,
          error: 'timeout',
          checkedAt: new Date(base + 4000),
        },
      ],
    });

    const filtered = await auth(
      request(app.getHttpServer()).get('/api/health-checks').query({ nodeId: nodeA.id, limit: 2 }),
    ).expect(200);
    expect(filtered.body).toHaveLength(2);
    expect(filtered.body.every((entry: { nodeId: string }) => entry.nodeId === nodeA.id)).toBe(true);
    expect(filtered.body.map((entry: { tag: string }) => entry.tag)).toEqual(['a-2', 'a-1']);

    const latest = await auth(request(app.getHttpServer()).get('/api/health-checks/latest')).expect(200);
    expect(latest.body.map((entry: { tag: string }) => entry.tag)).toEqual(
      expect.arrayContaining(['a-0', 'a-1', 'a-2', 'b-0']),
    );
  });

  it('restricts check history to admins and operators', async () => {
    await createUser('health-user@example.com');
    const regularUser = await login('health-user@example.com');

    await request(app.getHttpServer()).get('/api/health-checks').expect(401);
    await request(app.getHttpServer()).get('/api/health-checks/latest').expect(401);
    await auth(request(app.getHttpServer()).get('/api/health-checks'), regularUser).expect(403);
    await auth(request(app.getHttpServer()).get('/api/health-checks/latest'), regularUser).expect(403);
  });
});
