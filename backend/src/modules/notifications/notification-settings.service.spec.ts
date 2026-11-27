// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { encryptSecret } from '../../common/secret-crypto';
import { NotificationSettingsService } from './notification-settings.service';

describe('NotificationSettingsService', () => {
  let prisma: any;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    delete process.env.WEBHOOK_URL;
    prisma = {
      notificationCredential: {
        findUnique: jest.fn(async () => null),
        deleteMany: jest.fn(async () => ({})),
        upsert: jest.fn(async () => ({})),
      },
      notificationPolicy: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async ({ create }: any) => ({ updatedAt: new Date(), ...create })),
      },
      notificationDelivery: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => data),
        findMany: jest.fn(async () => []),
      },
    };
  });

  const service = () => new NotificationSettingsService(prisma);

  it('falls back to env and encrypts stored credentials', async () => {
    expect(await service().value('TELEGRAM_BOT_TOKEN')).toBe('env-token');
    await service().setCredentials({ WEBHOOK_URL: 'https://example.com/hook' });
    const upsert = prisma.notificationCredential.upsert.mock.calls[0][0];
    expect(upsert.create.value).toMatch(/^v1:/);
    expect(upsert.create.value).not.toContain('example.com');
    await service().setCredentials({ WEBHOOK_URL: '' });
    expect(prisma.notificationCredential.deleteMany).toHaveBeenCalledWith({ where: { key: 'WEBHOOK_URL' } });
  });

  it('never returns secret values from configured()', async () => {
    prisma.notificationCredential.findUnique.mockImplementation(async ({ where }: any) =>
      where.key === 'WEBHOOK_URL' ? { value: encryptSecret('https://secret.example.com/hook') } : null);
    const configured = await service().configured();
    expect(configured.WEBHOOK_URL).toBe(true);
    expect(JSON.stringify(configured)).not.toContain('secret.example.com');
  });

  it('validates policy and handles quiet hours across midnight', async () => {
    const svc = service();
    const policy = await svc.policy();
    expect(policy).toMatchObject({ enabled: true, cooldownMinutes: 0, minSeverity: 'warning' });
    await expect(svc.setPolicy({ quietHoursStart: '25:00' })).rejects.toThrow('HH:MM');
    await expect(svc.setPolicy({ cooldownMinutes: 5000 })).rejects.toThrow('cooldownMinutes');

    const night = { ...policy, quietHoursStart: '23:00', quietHoursEnd: '06:00' };
    expect(svc.isQuietHour(night, new Date('2026-11-25T23:30:00Z'))).toBe(true);
    expect(svc.isQuietHour(night, new Date('2026-11-25T12:00:00Z'))).toBe(false);
    expect(svc.allowsSeverity(policy, 'critical')).toBe(true);
    expect(svc.allowsSeverity(policy, 'info')).toBe(false);
  });

  it('honours cooldown only for recent successful deliveries', async () => {
    const svc = service();
    expect(await svc.withinCooldown('key', 5)).toBe(false);
    prisma.notificationDelivery.findFirst.mockResolvedValueOnce({ id: 'd1' });
    expect(await svc.withinCooldown('key', 5)).toBe(true);
    expect(prisma.notificationDelivery.findFirst.mock.calls[0][0].where).toMatchObject({ dedupeKey: 'key', status: 'sent' });
  });
});
