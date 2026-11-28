// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { NotificationEvent } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService security and routing', () => {
  let settings: any;
  let routes: any;
  let prisma: any;

  beforeEach(() => {
    settings = {
      value: jest.fn(async (key: string) => (key === 'WEBHOOK_URL' ? 'https://127.0.0.1/hook' : undefined)),
      configured: jest.fn(async () => ({})),
      policy: jest.fn(async () => ({
        enabled: true, quietHoursStart: null, quietHoursEnd: null,
        cooldownMinutes: 0, minSeverity: 'warning', escalationChannel: null,
      })),
      allowsSeverity: jest.fn(() => true),
      isQuietHour: jest.fn(() => false),
      withinCooldown: jest.fn(async () => false),
      recordDelivery: jest.fn(async () => ({})),
    };
    routes = { enabledChannels: jest.fn(async () => ['SIGNAL'] as any) };
    prisma = {};
  });

  const service = () => new NotificationsService(prisma, routes, settings, { request: jest.fn() } as any);

  it('rejects private webhook addresses in production without echoing the response', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const result = await service().sendWebhook({ event: 'test' });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('Private webhook');
    process.env.NODE_ENV = previous;
  });

  it('rejects IPv4-mapped IPv6 webhook addresses in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    settings.value.mockImplementation(async (key: string) =>
      key === 'WEBHOOK_URL' ? 'https://[::ffff:127.0.0.1]/hook' : undefined);
    const result = await service().sendWebhook({ event: 'test' });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('Private webhook');
    process.env.NODE_ENV = previous;
  });

  it('routes SIGNAL events and logs delivery', async () => {
    settings.value.mockImplementation(async (key: string) =>
      key === 'SIGNAL_API_URL' ? 'https://signal.local' :
      key === 'SIGNAL_PHONE_NUMBER' ? '+100' :
      key === 'SIGNAL_RECIPIENT' ? '+200' : undefined);
    const svc = service();
    const sendSignal = jest.spyOn(svc, 'sendSignal').mockResolvedValue({ sent: true });
    const result = await svc.emit(NotificationEvent.NODE_OFFLINE, {
      text: 'node down', plainText: 'node down', severity: 'critical', dedupeKey: 'node:1',
    });
    expect(sendSignal).toHaveBeenCalled();
    expect(result.signal).toEqual({ sent: true });
    expect(settings.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({
      event: 'NODE_OFFLINE', channel: 'signal', status: 'sent', dedupeKey: 'node:1',
    }));
  });

  it('skips everything during quiet hours', async () => {
    settings.isQuietHour.mockReturnValue(true);
    const result = await service().emit(NotificationEvent.NODE_ONLINE, { text: 'up' });
    expect(result.policy?.reason).toBe('quiet hours');
    expect(routes.enabledChannels).not.toHaveBeenCalled();
  });

  describe('sendDigestOnce', () => {
    const hour = 3_600_000;

    it('does not resend a digest after a restart while the interval has not passed', async () => {
      settings.withinCooldown.mockResolvedValue(true);
      const send = jest.fn(async () => ({ telegram: { sent: true } }));
      const result = await service().sendDigestOnce('telegram-report', 86_400_000, send);
      expect(result).toMatchObject({ sent: false, reason: 'interval not reached' });
      expect(send).not.toHaveBeenCalled();
      expect(settings.withinCooldown).toHaveBeenCalledWith('digest:telegram-report', 1440);
    });

    it('records a successful digest for the next restart', async () => {
      const send = jest.fn(async () => ({ telegram: { sent: true } }));
      const result = await service().sendDigestOnce('cheburcheck', hour, send);
      expect(result).toEqual({ sent: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(settings.recordDelivery).toHaveBeenCalledWith({
        event: 'DIGEST_SENT', channel: 'telegram', status: 'sent', dedupeKey: 'digest:cheburcheck',
      });
    });

    it('does not mark a failed digest as sent and honours force', async () => {
      const send = jest.fn(async () => ({ telegram: { sent: false, error: 'chat not found' } }));
      const svc = service();
      expect(await svc.sendDigestOnce('node-availability', hour, send)).toMatchObject({ sent: false });
      expect(settings.recordDelivery).not.toHaveBeenCalled();
      settings.withinCooldown.mockResolvedValue(true);
      send.mockResolvedValue({ telegram: { sent: true, error: '' } });
      expect(await svc.sendDigestOnce('node-availability', hour, send, true)).toMatchObject({ sent: true });
      expect(send).toHaveBeenCalledTimes(2);
    });
  });
});
