import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'supertest';
import { gunzipSync, gzipSync } from 'zlib';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = [
  'AlertHistory',
  'AuditLog',
  'RefreshToken',
  'Payment',
  'Inbound',
  'ConfigRevision',
  'NodeMetric',
  'Node',
  'Host',
  'Rule',
  'UserTraffic',
  'User',
  'Organization',
  'SubscriptionPlan',
];

const hasPgTools = (command: string) => spawnSync(command, ['--version']).status === 0;
const pgDumpAvailable = hasPgTools('pg_dump') && hasPgTools('psql');
const syntheticBackup = 'db-20260101-000000.sql.gz';
const monthPeriod = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

describe('XSS API (e2e, PostgreSQL: quotas, backups, plans, audit, CSV)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let backupDir: string;
  let previousBackupDir: string | undefined;
  const nodeToken = 'v15-quota-node-token';
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    const settingsTable = await prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'BackupSettings'
      ) AS present
    `;
    if (settingsTable[0]?.present) {
      await prisma.$executeRawUnsafe('TRUNCATE "BackupSettings" RESTART IDENTITY CASCADE');
    }
  };

  const createUser = (email: string) =>
    prisma.user.create({
      data: { email, passwordHash: 'e2e-hash', status: 'ACTIVE' },
    });

  const createNode = (name: string) =>
    prisma.node.create({
      data: {
        name,
        address: '127.0.0.1',
        tokenHash: createHash('sha256').update(nodeToken).digest('hex'),
      },
    });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL e2e tests');
    previousBackupDir = process.env.BACKUP_DIR;
    backupDir = mkdtempSync(path.join(os.tmpdir(), 'xss-e2e-backups-'));
    process.env.BACKUP_DIR = backupDir;
    process.env.BACKUP_KEEP = '7';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: process.env.ADMIN_EMAIL || 'e2e-admin@example.com', password: process.env.ADMIN_PASSWORD || 'e2e-password123' })
      .expect(201);
    token = login.body.accessToken;
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
    if (previousBackupDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = previousBackupDir;
    await fs.rm(backupDir, { recursive: true, force: true });
  }, 60000);

  it('grows per-user usage from node traffic reports, writes daily rows and reports exceeded status', async () => {
    const node = await createNode('quota-node');
    const user = await createUser('quota@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { trafficLimit: 1000n } });

    const first = await request(app.getHttpServer())
      .post(`/api/nodes/${node.id}/traffic`)
      .set('Authorization', `Bearer ${nodeToken}`)
      .send({ entries: [{ subscriptionToken: user.subscriptionToken, up: 300, down: 200 }] })
      .expect(201);
    expect(first.body).toMatchObject({ recorded: 1, skipped: 0, expired: 0, period: monthPeriod });

    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterFirst.trafficUsed).toBe(500n);
    expect(afterFirst.status).toBe('ACTIVE');

    const daily = await prisma.userTraffic.findMany({ where: { userId: user.id } });
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ nodeId: node.id, period: monthPeriod, bytesUp: 300n, bytesDown: 200n });

    const second = await request(app.getHttpServer())
      .post(`/api/nodes/${node.id}/traffic`)
      .set('Authorization', `Bearer ${nodeToken}`)
      .send({ entries: [{ subscriptionToken: user.subscriptionToken, up: 400, down: 200 }] })
      .expect(201);
    expect(second.body).toMatchObject({ recorded: 1, expired: 1 });

    const exceeded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(exceeded.trafficUsed).toBe(1100n);
    expect(exceeded.status).toBe('EXPIRED');

    const status = await request(app.getHttpServer())
      .get(`/api/subscriptions/${user.subscriptionToken}?format=json`)
      .expect(200);
    expect(status.body.status).toBe('exceeded');
    await request(app.getHttpServer()).get(`/api/subscriptions/${user.subscriptionToken}/raw`).expect(403);

    const chart = await auth(request(app.getHttpServer()).get(`/api/traffic/chart?userId=${user.id}&days=7`)).expect(200);
    expect(chart.body).toMatchObject({ days: 7, total: 1 });
    expect(chart.body.series[0]).toMatchObject({ date: today, up: '700', down: '400', total: '1100' });

    const history = await auth(request(app.getHttpServer()).get(`/api/traffic?userId=${user.id}`)).expect(200);
    expect(history.body).toMatchObject({ total: 2, bytesUp: '700', bytesDown: '400' });
  });

  (pgDumpAvailable ? it : it.skip)('creates, lists and downloads a backup through the admin API', async () => {
    await createUser('backup@example.com');
    const created = await auth(request(app.getHttpServer()).post('/api/backups')).expect(201);
    expect(created.body.name).toMatch(/^db-\d{8}-\d{6}\.sql\.gz$/);

    const listed = await auth(request(app.getHttpServer()).get('/api/backups')).expect(200);
    expect(listed.body.data.map((item: { name: string }) => item.name)).toContain(created.body.name);

    const downloaded = await auth(request(app.getHttpServer()).get(`/api/backups/${created.body.name}/download`))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.headers['content-disposition']).toContain(created.body.name);
    const sql = gunzipSync(downloaded.body).toString('utf8');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('backup@example.com');
  });

  (pgDumpAvailable ? it : it.skip)('restores only with confirmation and deletes backups', async () => {
    await fs.writeFile(path.join(backupDir, syntheticBackup), gzipSync('SELECT 1;\n'));

    await auth(
      request(app.getHttpServer()).post(`/api/backups/${syntheticBackup}/restore`).send({ confirm: false }),
    ).expect(400);

    const restored = await auth(
      request(app.getHttpServer()).post(`/api/backups/${syntheticBackup}/restore`).send({ confirm: true }),
    ).expect(201);
    expect(restored.body).toEqual({ restored: syntheticBackup });

    const created = await auth(request(app.getHttpServer()).post('/api/backups')).expect(201);
    const deleted = await auth(request(app.getHttpServer()).delete(`/api/backups/${created.body.name}`)).expect(200);
    expect(deleted.body).toEqual({ removed: created.body.name });

    const listed = await auth(request(app.getHttpServer()).get('/api/backups')).expect(200);
    expect(listed.body.data.map((item: { name: string }) => item.name)).not.toContain(created.body.name);

    await fs.unlink(path.join(backupDir, syntheticBackup));
    const audit = await auth(request(app.getHttpServer()).get('/api/audit?entity=backup&limit=100')).expect(200);
    expect(audit.body.data.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining(['backup.restore', 'backup.delete']),
    );
  });

  it('creates and toggles a plan, then activates the user and resets traffic on payment', async () => {
    const user = await createUser('plan@example.com');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'EXPIRED', trafficUsed: 777n, trafficLimit: 10n },
    });

    const plan = await auth(
      request(app.getHttpServer())
        .post('/api/payments/plans')
        .send({ name: 'QA plan', price: 5, trafficGb: 2, durationDays: 10 }),
    ).expect(201);
    expect(plan.body).toMatchObject({ name: 'QA plan', enabled: true });

    const patched = await auth(
      request(app.getHttpServer()).patch(`/api/payments/plans/${plan.body.id}`).send({ enabled: false }),
    ).expect(200);
    expect(patched.body.enabled).toBe(false);

    const payment = await auth(
      request(app.getHttpServer())
        .post('/api/payments')
        .send({ userId: user.id, amount: 5, planId: plan.body.id }),
    ).expect(201);
    expect(payment.body).toMatchObject({ status: 'pending', planId: plan.body.id });

    await auth(request(app.getHttpServer()).post(`/api/payments/${payment.body.id}/paid`)).expect(201);

    const provisioned = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(provisioned.status).toBe('ACTIVE');
    expect(provisioned.trafficUsed).toBe(0n);
    expect(provisioned.trafficLimit).toBe(2n * 1024n ** 3n);
    expect(provisioned.expiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('filters, paginates and time-sorts audit logs', async () => {
    const user = await createUser('audit@example.com');
    const other = await createUser('audit-other@example.com');
    const base = {
      action: 'user.update',
      entity: 'QA-audit',
      metadata: { source: 'e2e' },
    };
    await prisma.auditLog.create({
      data: { ...base, userId: user.id, entityId: 'old', createdAt: new Date('2026-01-01T00:00:00Z') },
    });
    await prisma.auditLog.create({
      data: { ...base, userId: user.id, entityId: 'new', createdAt: new Date('2026-01-02T00:00:00Z') },
    });
    await prisma.auditLog.create({
      data: { ...base, userId: other.id, entityId: 'other', createdAt: new Date('2026-01-03T00:00:00Z') },
    });

    const filtered = await auth(
      request(app.getHttpServer()).get(`/api/audit?entity=QA-audit&userId=${user.id}&page=1&limit=1`),
    ).expect(200);
    expect(filtered.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(filtered.body.data[0].entityId).toBe('new');

    const secondPage = await auth(
      request(app.getHttpServer()).get(`/api/audit?entity=QA-audit&userId=${user.id}&page=2&limit=1`),
    ).expect(200);
    expect(secondPage.body.data[0].entityId).toBe('old');

    const byAction = await auth(
      request(app.getHttpServer()).get('/api/audit?entity=QA-audit&action=USER.UPDATE'),
    ).expect(200);
    expect(byAction.body.total).toBe(3);
  });

  it('exports CSV with headers, comma separators and user/period filters', async () => {
    const user = await createUser('csv@example.com');
    const other = await createUser('csv-other@example.com');
    const node = await createNode('csv-node');
    await prisma.userTraffic.create({
      data: {
        userId: user.id,
        nodeId: node.id,
        period: '2026-01',
        bytesUp: 111n,
        bytesDown: 222n,
        createdAt: new Date('2026-01-15T12:00:00Z'),
      },
    });
    await prisma.userTraffic.create({
      data: {
        userId: user.id,
        nodeId: node.id,
        period: '2025-12',
        bytesUp: 999n,
        bytesDown: 999n,
        createdAt: new Date('2025-12-15T12:00:00Z'),
      },
    });
    await prisma.userTraffic.create({
      data: {
        userId: other.id,
        nodeId: node.id,
        period: '2026-01',
        bytesUp: 888n,
        bytesDown: 888n,
        createdAt: new Date('2026-01-16T12:00:00Z'),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: '=SUM(A1)',
        entity: 'QA-csv',
        createdAt: new Date('2026-01-15T12:00:00Z'),
      },
    });
    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: 7,
        status: 'paid',
        provider: 'manual',
        createdAt: new Date('2026-01-15T12:00:00Z'),
      },
    });
    await prisma.payment.create({
      data: {
        userId: other.id,
        amount: 99,
        status: 'paid',
        provider: 'manual',
        createdAt: new Date('2025-12-15T12:00:00Z'),
      },
    });

    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-31T23:59:59Z';
    const traffic = await auth(
      request(app.getHttpServer()).get(`/api/traffic/export.csv?userId=${user.id}&from=${from}&to=${to}`),
    ).expect(200);
    expect(traffic.headers['content-type']).toContain('text/csv');
    expect(traffic.headers['content-disposition']).toContain('traffic.csv');
    expect(traffic.text.split('\n')[0]).toBe(
      '"createdAt","userId","nodeId","period","bytesUp","bytesDown","total"',
    );
    expect(traffic.text).toContain(`"${user.id}"`);
    expect(traffic.text).toContain('"333"');
    expect(traffic.text).not.toContain(`"${other.id}"`);
    expect(traffic.text).not.toContain('"1998"');

    const audit = await auth(
      request(app.getHttpServer()).get(`/api/audit/export.csv?entity=QA-csv&userId=${user.id}&from=${from}&to=${to}`),
    ).expect(200);
    expect(audit.text.split('\n')[0]).toBe(
      '"createdAt","userId","action","entity","entityId","ip","metadata"',
    );
    expect(audit.text).toContain(`"${user.id}"`);
    expect(audit.text).toContain(`"'=SUM(A1)"`);

    const payments = await auth(
      request(app.getHttpServer()).get(`/api/payments/export.csv?from=${from}&to=${to}`),
    ).expect(200);
    expect(payments.text.split('\n')[0]).toBe(
      '"createdAt","userId","email","amount","currency","status","provider","plan","externalId"',
    );
    expect(payments.text).toContain('"csv@example.com"');
    expect(payments.text).not.toContain('"csv-other@example.com"');
  });
});
