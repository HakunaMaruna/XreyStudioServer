// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
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
  'User',
  'Organization',
];

describe('XSS API (e2e, PostgreSQL: v2.6 Settings API)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const password = 'settings-e2e-pass-123';
  const auth = (req: request.Test, bearer: string = token) => req.set('Authorization', `Bearer ${bearer}`);

  const reset = async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  const login = async (email: string, secret: string = process.env.ADMIN_PASSWORD || 'e2e-password123') => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: secret })
      .expect(201);
    return response.body.accessToken as string;
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

    token = await login(process.env.ADMIN_EMAIL || 'e2e-admin@example.com');
    expect(token).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await reset();
    await app?.close();
  }, 60000);

  it('reads defaults and persists clamped admin settings', async () => {
    const initial = await auth(request(app.getHttpServer()).get('/api/settings')).expect(200);
    expect(initial.body).toMatchObject({
      language: 'ru',
      theme: 'dark',
      alertsEnabled: true,
      metricsEnabled: true,
      rateLimit: 120,
      sessionMinutes: 15,
    });

    const patched = await auth(
      request(app.getHttpServer())
        .patch('/api/settings')
        .send({ language: 'en', theme: 'light', alertsEnabled: false, rateLimit: 5000, sessionMinutes: 9999 }),
    ).expect(200);
    expect(patched.body).toMatchObject({
      language: 'en',
      theme: 'light',
      alertsEnabled: false,
      rateLimit: 5000,
      sessionMinutes: 1440,
    });

    const persisted = await auth(request(app.getHttpServer()).get('/api/settings')).expect(200);
    expect(persisted.body).toEqual(patched.body);

    const bounded = await auth(
      request(app.getHttpServer()).patch('/api/settings').send({ rateLimit: 0, sessionMinutes: -3 }),
    ).expect(200);
    expect(bounded.body).toMatchObject({ rateLimit: 1, sessionMinutes: 1 });
  });

  it('keeps settings admin-only across tenants', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Settings A', slug: 'settings-a' } });
    const orgB = await prisma.organization.create({ data: { name: 'Settings B', slug: 'settings-b' } });
    await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'settings-operator@example.com', password, role: 'OPERATOR', organizationId: orgA.id }),
    ).expect(201);
    await auth(
      request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'settings-user@example.com', password, role: 'USER', organizationId: orgB.id }),
    ).expect(201);

    const operator = await login('settings-operator@example.com', password);
    const user = await login('settings-user@example.com', password);

    await request(app.getHttpServer()).get('/api/settings').expect(401);
    await request(app.getHttpServer()).patch('/api/settings').send({ theme: 'light' }).expect(401);

    await auth(request(app.getHttpServer()).get('/api/settings'), operator).expect(403);
    await auth(request(app.getHttpServer()).patch('/api/settings').send({ theme: 'dark' }), operator).expect(403);
    await auth(request(app.getHttpServer()).get('/api/settings'), user).expect(403);
    await auth(request(app.getHttpServer()).patch('/api/settings').send({ theme: 'dark' }), user).expect(403);

    const unchanged = await auth(request(app.getHttpServer()).get('/api/settings')).expect(200);
    expect(unchanged.body).toMatchObject({ rateLimit: 1, sessionMinutes: 1 });
  });
});
