// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { TelemetryPayload, TelemetryService } from './telemetry.service';

const payload = (overrides: Partial<TelemetryPayload> = {}): TelemetryPayload => ({
  installId: '11111111-2222-4333-8444-555555555555',
  version: '2.40.0',
  mode: 'tenant',
  capturedAt: new Date().toISOString(),
  counts: { nodes: 3, users: 10, rules: 2 },
  events: [{ action: 'node.error', count: 4 }],
  ...overrides,
});

describe('TelemetryService', () => {
  let prisma: any;
  let service: TelemetryService;
  let setting: any;

  beforeEach(() => {
    setting = {
      id: 'default', installId: 'local-install', accepted: false, declined: false, enabled: false,
      lastSentAt: null, licenseAcceptedAt: null,
    };
    prisma = {
      telemetrySetting: {
        findUnique: jest.fn(async () => setting),
        upsert: jest.fn(async () => setting),
        update: jest.fn(async ({ data }: any) => { Object.assign(setting, data); return setting; }),
      },
      telemetrySnapshot: { create: jest.fn(async () => ({})) },
      telemetryInstallation: { upsert: jest.fn(async () => ({ id: 'inst-1' })), findMany: jest.fn(async () => []) },
      telemetryLog: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
      user: { count: jest.fn(async () => 10) },
      node: { count: jest.fn(async () => 3) },
      inbound: { count: jest.fn(async () => 5) },
      rule: { count: jest.fn(async () => 2) },
      host: { count: jest.fn(async () => 1) },
      routingProfile: { count: jest.fn(async () => 1) },
      organization: { count: jest.fn(async () => 1) },
      subscriptionPlan: { count: jest.fn(async () => 2) },
      payment: { count: jest.fn(async () => 1) },
      balancer: { count: jest.fn(async () => 1) },
      dnsProfile: { count: jest.fn(async () => 1) },
      plugin: { count: jest.fn(async () => 2) },
      systemSnapshot: { count: jest.fn(async () => 7) },
      auditLog: { groupBy: jest.fn(async () => []) },
    };
    service = new TelemetryService(prisma);
    delete process.env.TELEMETRY_URL;
  });

  it('does not send without consent or URL', async () => {
    expect(await service.send()).toEqual({ sent: false, reason: 'telemetry disabled' });
    setting.accepted = true; setting.enabled = true;
    expect(await service.send()).toEqual({ sent: false, reason: 'telemetry disabled' });
  });

  it('ingests valid reports and rejects malicious payloads', async () => {
    const ctx: any = { tokenId: 't1', role: 'ADMIN' };
    expect(await service.ingest(payload(), ctx)).toEqual({ received: true, installationId: 'inst-1' });
    expect(prisma.telemetrySnapshot.create).toHaveBeenCalled();
    await expect(service.ingest(payload({ installId: '../evil' }), ctx)).rejects.toThrow(BadRequestException);
    await expect(service.ingest(payload({ counts: { x: -1 } }), ctx)).rejects.toThrow('Invalid counts');
  });

  it('drops events that are not on the allowlist', async () => {
    await service.ingest(payload({ events: [{ action: 'user.email.read', count: 5 }] }), {} as any);
    expect(prisma.telemetryLog.create).not.toHaveBeenCalled();
  });

  it('records a real decline without accepting the license', async () => {
    await service.consent({ accepted: false, enabled: true, declined: true });
    expect(setting).toMatchObject({ accepted: false, declined: true, enabled: false, licenseAcceptedAt: null });
  });

  it('rejects malformed events and does not persist the raw payload', async () => {
    const ctx: any = { tokenId: 't1', role: 'ADMIN' };
    await expect(service.ingest(payload({ events: 'bad' } as any), ctx)).rejects.toThrow('events must be an array');
    await expect(service.ingest(payload({ events: [null] } as any), ctx)).resolves.toHaveProperty('received', true);
    const stored = prisma.telemetrySnapshot.create.mock.calls[0][0].data.payload;
    expect(stored.events).toEqual([]);
  });

  it('collects only aggregate counters', async () => {
    const data = await service.collect();
    expect(data.installId).toBe('local-install');
    expect(data.counts).toEqual(expect.objectContaining({ nodes: 3, users: 10, rules: 2 }));
    expect(JSON.stringify(data)).not.toContain('email');
  });
});
