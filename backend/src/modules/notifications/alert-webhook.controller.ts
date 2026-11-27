// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { NotificationEvent } from '@prisma/client';
import { NotificationsService } from './notifications.service';

export function eventFromAlertLabels(
  labels: Record<string, string> | undefined,
  title?: string,
): NotificationEvent {
  const raw = `${labels?.event || labels?.notificationEvent || labels?.alertname || title || ''}`
    .trim()
    .toUpperCase();
  const candidate = Object.values(NotificationEvent).find((event) => raw.includes(event));
  if (candidate) return candidate;
  const name = raw.toLowerCase();
  if (name.includes('traffic')) return NotificationEvent.TRAFFIC_ALERT;
  if (name.includes('backup')) return NotificationEvent.BACKUP_FAILED;
  if (name.includes('config')) return NotificationEvent.CONFIG_APPLIED;
  if (name.includes('payment')) return NotificationEvent.PAYMENT_RECEIVED;
  if (name.includes('online') && !name.includes('offline')) return NotificationEvent.NODE_ONLINE;
  if (name.includes('offline') || name.includes('node')) return NotificationEvent.NODE_OFFLINE;
  return NotificationEvent.TRAFFIC_ALERT;
}

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
    const entries = alerts.length
      ? alerts
      : [
          {
            status: body?.status || 'firing',
            labels: { alertname: body?.title || 'XSS alert' },
            annotations: { description: body?.message },
          },
        ];

    const records = await Promise.all(
      entries.map((alert) => {
        const labels = alert.labels || {};
        const annotations = alert.annotations || {};
        return this.notifications.recordAlert({
          status: alert.status || body?.status || 'firing',
          title: labels.alertname || annotations.summary || body?.title || 'XSS alert',
          message: annotations.description || annotations.message || body?.message || null,
          severity: labels.severity || null,
          source: 'grafana',
          labels,
        });
      }),
    );

    const lines = alertlines(body, alerts);
    const text = lines.length ? lines.join('\n') : `🔴 ${body?.title || body?.message || 'XSS alert'}`;
    const event = eventFromAlertLabels(
      alerts[0]?.labels || { alertname: body?.title },
      body?.title,
    );
    const organizationId = alerts.find((a) => a.labels?.organizationId)?.labels?.organizationId
      || null;
    const severity = alerts.find((alert) => alert.labels?.severity)?.labels?.severity as string | undefined
      || (body?.status === 'firing' ? 'warning' : 'info');
    const channels = await this.notifications.emit(event, {
      text,
      plainText: lines.length ? lines.join('\n') : `${body?.title || body?.message || 'XSS alert'}`,
      subject: body?.title || 'XSS alert',
      webhook: { event, status: body?.status, title: body?.title, alerts },
      severity,
      dedupeKey: `${event}:${body?.title || 'grafana'}`,
    }, organizationId);
    return { received: alerts.length, persisted: records.length, ...channels };
  }
}

function alertlines(body: GrafanaPayload, alerts: GrafanaAlert[]): string[] {
  return alerts.map((alert) => {
    const labels = alert.labels || {};
    const annotations = alert.annotations || {};
    const name = labels.alertname || annotations.summary || body?.title || 'XSS alert';
    const value = annotations.description || annotations.message || body?.message || '';
    return `${alert.status === 'resolved' ? '✅' : '🔴'} ${name}${value ? ` — ${value}` : ''}`;
  });
}
