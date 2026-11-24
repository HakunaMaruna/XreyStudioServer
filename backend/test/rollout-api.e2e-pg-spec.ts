import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AgentClientService } from '../src/modules/config/agent-client.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QA: API, используемое scripts/rollout.sh, issue #148.
 * Проверяем контракт apply / revisions / health / rollback на реальном PostgreSQL.
 * Агент подменяется:mock не делает сетевых вызовов к вымышленным адресам нод.
 */
describe('Rollout API (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken: string;
  let operatorToken: string;
  let nodeAId: string;
  let nodeBId: string;
  const applyMock = jest.fn().mockResolvedValue({ applied: true, version: 1 });

  const TABLES = [
    'AlertHistory',
    'AuditLog',
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentClientService)
      .useValue({ applyConfig: applyMock })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }

    const admin = await prisma.user.create({
      data: {
        email: 'rollout-admin@example.com',
        passwordHash: 'hash',
        role: 'ADMIN',
        organizationId: 'rollout-org-a',
      },
    });
    const operator = await prisma.user.create({
      data: {
        email: 'rollout-operator@example.com',
        passwordHash: 'hash',
        role: 'OPERATOR',
        organizationId: 'rollout-org-a',
      },
    });
    adminToken = jwt.sign({ sub: admin.id, userId: admin.id, role: 'ADMIN' });
    operatorToken = jwt.sign({
      sub: operator.id,
      userId: operator.id,
      role: 'OPERATOR',
      organizationId: 'rollout-org-a',
    });

    const nodeA = await prisma.node.create({
      data: { name: 'rollout-node-a', address: '10.9.0.1', organizationId: 'rollout-org-a' },
    });
    const nodeB = await prisma.node.create({
      data: { name: 'rollout-node-b', address: '10.9.0.2', organizationId: 'rollout-org-b' },
    });
    nodeAId = nodeA.id;
    nodeBId = nodeB.id;
  }, 60000);

  afterAll(async () => {
    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    await app?.close();
  }, 60000);

  const auth = (token: string, r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('applies config to a node and records a revision (POST /apply used by rollout.sh)', async () => {
    applyMock.mockClear();
    const response = await auth(
      adminToken,
      request(app.getHttpServer()).post(`/api/nodes/${nodeAId}/apply`).send({}),
    ).expect(201);

    expect(response.body.applied).toBe(true);
    expect(typeof response.body.revisionId).toBe('string');
    expect(response.body.version).toBe(1);
    expect(applyMock).toHaveBeenCalledTimes(1);

    const revision = await prisma.configRevision.findUniqueOrThrow({
      where: { id: response.body.revisionId },
    });
    expect(revision.nodeId).toBe(nodeAId);
    expect(revision.applied).toBe(true);
    expect(JSON.parse(revision.content)).toEqual(
      expect.objectContaining({ inbounds: expect.any(Array), routing: expect.any(Object) }),
    );
  });

  it('lists revisions newest first (choose a rollback target)', async () => {
    await auth(adminToken, request(app.getHttpServer()).post(`/api/nodes/${nodeAId}/apply`).send({})).expect(201);
    const response = await auth(
      adminToken,
      request(app.getHttpServer()).get(`/api/nodes/${nodeAId}/revisions`),
    ).expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body[0].version).toBeGreaterThan(response.body[1].version);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('applied');
  });

  it('exposes node health in the format used by the rollout health gate', async () => {
    await prisma.node.update({
      where: { id: nodeAId },
      data: { status: 'ONLINE' as any, lastSeenAt: new Date() },
    });
    const response = await auth(
      adminToken,
      request(app.getHttpServer()).get(`/api/nodes/${nodeAId}/health`),
    ).expect(200);

    expect(response.body.nodeId).toBe(nodeAId);
    expect(response.body.status).toBe('ONLINE');
    expect(response.body.online).toBe(true);
  });

  it('rolls back to a specified older revision (POST /rollback/:revisionId used by rollout.sh)', async () => {
    const newer = await auth(
      adminToken,
      request(app.getHttpServer()).post(`/api/nodes/${nodeAId}/apply`).send({}),
    ).expect(201);
    const before = await auth(
      adminToken,
      request(app.getHttpServer()).get(`/api/nodes/${nodeAId}/revisions`),
    ).expect(200);
    const older = before.body.find((r: any) => r.id !== newer.body.revisionId);
    expect(older).toBeDefined();

    const response = await auth(
      adminToken,
      request(app.getHttpServer()).post(`/api/nodes/${nodeAId}/rollback/${older.id}`),
    ).expect(201);
    expect(response.body.revisionId).toBe(older.id);
    expect(response.body.applied).toBe(true);

    const revisions = await prisma.configRevision.findMany({ where: { nodeId: nodeAId } });
    expect(revisions.find((r) => r.id === older.id)?.applied).toBe(true);
    expect(revisions.find((r) => r.id === newer.body.revisionId)?.applied).toBe(false);
  });

  it('denies OPERATOR access to another organization node on every rollout endpoint', async () => {
    await auth(adminToken, request(app.getHttpServer()).get(`/api/nodes/${nodeBId}/health`)).expect(200);
    await auth(operatorToken, request(app.getHttpServer()).get(`/api/nodes/${nodeBId}/health`)).expect(404);
    await auth(operatorToken, request(app.getHttpServer()).get(`/api/nodes/${nodeBId}/revisions`)).expect(404);
    await auth(
      operatorToken,
      request(app.getHttpServer()).post(`/api/nodes/${nodeBId}/apply`).send({}),
    ).expect(404);
    await auth(
      operatorToken,
      request(app.getHttpServer()).post(`/api/nodes/${nodeBId}/rollback/some-revision`),
    ).expect(404);
  });
});
