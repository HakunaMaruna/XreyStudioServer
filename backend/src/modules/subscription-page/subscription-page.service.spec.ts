// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { SubscriptionPageService } from './subscription-page.service';

const admin = { role: 'ADMIN' } as any;

describe('SubscriptionPageService', () => {
  let prisma: any;
  let stored: any;

  beforeEach(() => {
    stored = null;
    prisma = {
      subscriptionPageSettings: {
        findUnique: jest.fn(async () => stored),
        upsert: jest.fn(async ({ create }: any) => { stored = { id: 'default', settings: create.settings, updatedAt: new Date() }; return stored; }),
      },
      vpnApp: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 'app-1', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
    };
  });

  const service = () => new SubscriptionPageService(prisma);

  it('merges defaults and persists sanitized CSS', async () => {
    const settings = await service().updateSettings({
      brand: 'MyVPN',
      accent: '#112233',
      customCss: 'body { color: red; } @import url("http://evil"); <script>alert(1)</script>',
      defaultTheme: 'dark',
    } as any);
    expect(settings.brand).toBe('MyVPN');
    expect(settings.blocks.qr).toBe(true);
    expect(settings.customCss).not.toContain('@import');
    expect(settings.customCss).not.toContain('<script>');
    expect(settings.customCss).not.toContain('url(');
  });

  it('rejects invalid colors, URLs and CSS size', async () => {
    await expect(service().updateSettings({ accent: 'red' } as any)).rejects.toThrow(BadRequestException);
    await expect(service().updateSettings({ logoUrl: 'javascript:alert(1)' } as any)).rejects.toThrow('Invalid logoUrl');
    await expect(service().updateSettings({ customCss: 'a'.repeat(20001) } as any)).rejects.toThrow('too large');
  });

  it('validates app deep links and builds a safe URL', async () => {
    await expect(service().createApp({ name: 'X', platform: 'android', deepLinkTemplate: 'v2rayng://add' }, admin))
      .rejects.toThrow('{subscription_url}');
    const svc = service();
    expect(svc.buildDeepLink('v2rayng://add/{subscription_url}', 'https://x/sub?hwid=a b'))
      .toBe('v2rayng://add/https%3A%2F%2Fx%2Fsub%3Fhwid%3Da%20b');
  });

  it('seeds default apps once and exposes them in public payload', async () => {
    const svc = service();
    await svc.listApps(admin);
    expect(prisma.vpnApp.create.mock.calls.length).toBeGreaterThan(5);
    expect(stored.settings.appsSeeded).toBe(true);
    prisma.vpnApp.findMany.mockResolvedValueOnce([{ id: 'a', name: 'Happ', platform: 'android', enabled: true, sortOrder: 1, iconUrl: null, downloadUrl: null, deepLinkTemplate: 'happ://add/{subscription_url}', instructions: { ru: 'txt' } }]);
    const payload: any = await svc.publicPayload();
    expect(payload.apps[0].name).toBe('Happ');
    expect(payload.settings.blocks.qr).toBe(true);
  });
});
