import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

/**
 * QA: event-level notification routing delivered by real producers.
 * Запуск: npm run test:e2e:pg (реальный PostgreSQL, см. test/setup-env-pg.js).
 */
describe('Event-level notification routing (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let sink: Server;
  let received: Array<Record<string, unknown>>;
  let webhookUrl: string;

  beforeAll(async () => {
    received = [];
    sink = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          received.push(JSON.parse(body) as Record<string, unknown>);
        } catch {
          // Invalid payloads are ignored; the test asserts on valid webhooks only.
        }
        res.writeHead(200);
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
    webhookUrl = `http://127.0.0.1:${(sink.address() as AddressInfo).port}/hook`;
    process.env.WEBHOOK_URL = webhookUrl;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);

    await prisma.$executeRawUnsafe('TRUNCATE TABLE "NotificationRoute" CASCADE');
    await prisma.notificationRoute.create({
      data: { event: 'TRAFFIC_ALERT', channel: 'WEBHOOK', enabled: true },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (sink) await new Promise<void>((resolve) => sink.close(() => resolve()));
    delete process.env.WEBHOOK_URL;
  });

  it('delivers only channels enabled for the event', async () => {
    received.length = 0;
    const result = await notifications.emit('TRAFFIC_ALERT', {
      text: 'traffic test',
      plainText: 'traffic test',
      webhook: { event: 'TRAFFIC_ALERT', source: 'unit' },
    });
    expect(result.webhook?.sent).toBe(true);
    expect(result.telegram).toBeUndefined();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ event: 'TRAFFIC_ALERT', source: 'unit' });
  });

  it('does not deliver a disabled event', async () => {
    received.length = 0;
    const result = await notifications.emit('USER_EXPIRED', {
      text: 'expired',
      plainText: 'expired',
      webhook: { event: 'USER_EXPIRED' },
    });
    expect(result.webhook).toBeUndefined();
    expect(received).toHaveLength(0);
  });

  it('routes Grafana alerts through emit() with a mapped event', async () => {
    received.length = 0;
    await request(app.getHttpServer())
      .post('/api/notifications/alerts')
      .set('Authorization', `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`)
      .send({
        status: 'firing',
        title: 'Grafana alert',
        alerts: [{ status: 'firing', labels: { alertname: 'Traffic spike' } }],
      })
      .expect(201);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ event: 'TRAFFIC_ALERT' });
    const stored = await prisma.alertHistory.findFirst({ where: { title: 'Traffic spike' } });
    expect(stored).not.toBeNull();
  });
});
