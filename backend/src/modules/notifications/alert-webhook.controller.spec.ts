import { NotificationEvent } from '@prisma/client';
import { eventFromAlertLabels } from './alert-webhook.controller';

describe('eventFromAlertLabels', () => {
  it('uses an explicit notificationEvent label', () => {
    expect(eventFromAlertLabels({ notificationEvent: 'backup_failed' }, 'Other')).toBe(
      NotificationEvent.BACKUP_FAILED,
    );
  });

  it('maps common Grafana alert names to XSS events', () => {
    expect(eventFromAlertLabels({ alertname: 'Traffic spike' })).toBe(
      NotificationEvent.TRAFFIC_ALERT,
    );
    expect(eventFromAlertLabels({ alertname: 'node offline' })).toBe(
      NotificationEvent.NODE_OFFLINE,
    );
    expect(eventFromAlertLabels({ alertname: 'payment received' })).toBe(
      NotificationEvent.PAYMENT_RECEIVED,
    );
  });

  it('falls back to a traffic alert for unknown names', () => {
    expect(eventFromAlertLabels(undefined, 'Mystery')).toBe(NotificationEvent.TRAFFIC_ALERT);
  });
});
