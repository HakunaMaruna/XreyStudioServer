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
});
