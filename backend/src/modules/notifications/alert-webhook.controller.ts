import { Body, Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { NotificationsService } from './notifications.service';

type GrafanaAlert = {
  status?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
};

type GrafanaPayload = {
  status?: string;
  title?: string;
  message?: string;
  alerts?: GrafanaAlert[];
};

@Controller('notifications/alerts')
export class AlertWebhookController {
  constructor(private notifications: NotificationsService) {}

  private authorized(header?: string) {
    const expected = process.env.ALERT_WEBHOOK_TOKEN;
    if (!expected) throw new ServiceUnavailableException('Alert webhook is not configured');
    const provided = (header || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid alert token');
    }
  }

  @Post()
  async receive(@Body() body: GrafanaPayload, @Headers('authorization') authorization?: string) {
    this.authorized(authorization);
    const alerts = Array.isArray(body?.alerts) ? body.alerts : [];
    const lines = alerts.map((alert) => {
      const labels = alert.labels || {};
      const annotations = alert.annotations || {};
      const name = labels.alertname || annotations.summary || body?.title || 'XSS alert';
      const value = annotations.description || annotations.message || body?.message || '';
      return `${alert.status === 'resolved' ? '✅' : '🔴'} ${name}${value ? ` — ${value}` : ''}`;
    });
    const text = lines.length ? lines.join('\n') : `🔴 ${body?.title || body?.message || 'XSS alert'}`;
    return { received: alerts.length, ...(await this.notifications.sendTelegram(text)) };
  }
}
