import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = ['UserTraffic', 'User', 'Organization'];
const DEVICE_LIMIT = Number(process.env.DEVICE_LIMIT || 3);

describe.skip('XSS API (e2e, PostgreSQL: v2.9 devices — pending, API not present in v2.8.0)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = 'devices-e2e-pass-123';

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await reset();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('binds a device by subscription token and persists it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: 'device-bind@example.com', password })
      .expect(201);
    const token = created.body.subscriptionToken as string;

    const bound = await request(app.getHttpServer())
      .post('/api/devices/bind')
      .send({ subscriptionToken: token, deviceId: 'device-1' })
      .expect(201);
    expect(bound.body).toMatchObject({ deviceId: 'device-1' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('ACTIVE');

    await request(app.getHttpServer())
      .post('/api/devices/bind')
      .send({ subscriptionToken: 'missing-token', deviceId: 'device-2' })
      .expect(404);
  });

  it('blocks a user after the device limit is exceeded', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: 'device-limit@example.com', password })
      .expect(201);
    const token = created.body.subscriptionToken as string;

    for (let i = 1; i <= DEVICE_LIMIT; i += 1) {
      await request(app.getHttpServer())
        .post('/api/devices/bind')
        .send({ subscriptionToken: token, deviceId: `device-${i}` })
        .expect(201);
    }

    const denied = await request(app.getHttpServer())
      .post('/api/devices/bind')
      .send({ subscriptionToken: token, deviceId: `device-${DEVICE_LIMIT + 1}` });
    expect([403, 409, 429]).toContain(denied.status);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('BLOCK');
  });
});
