// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const NOTIFICATION_CREDENTIAL_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'WEBHOOK_URL',
  'WEBHOOK_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM',
  'ALERT_EMAIL_TO',
  'SIGNAL_API_URL',
  'SIGNAL_PHONE_NUMBER',
  'SIGNAL_RECIPIENT',
  'CHEBURCHECK_API_TOKEN',
  'CHEBURCHECK_BASE_URL',
  'NOTIFICATION_VIA_NODE_ID',
  'TELEGRAM_REPORT_INTERVAL_MS',
  'NODE_DIGEST_INTERVAL_MS',
] as const;

export type NotificationCredentialKey = (typeof NOTIFICATION_CREDENTIAL_KEYS)[number];

// Non-secret values can be safely returned to the UI so saved settings are
// visible when the tab is reopened. Secrets are write-only.
const NON_SECRET_KEYS: ReadonlySet<string> = new Set([
  'TELEGRAM_CHAT_ID', 'WEBHOOK_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER',
  'EMAIL_FROM', 'ALERT_EMAIL_TO', 'SIGNAL_API_URL', 'SIGNAL_PHONE_NUMBER',
  'SIGNAL_RECIPIENT', 'CHEBURCHECK_BASE_URL', 'TELEGRAM_REPORT_INTERVAL_MS', 'NODE_DIGEST_INTERVAL_MS',
]);

export type NotificationPolicyData = {
  enabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  cooldownMinutes?: number;
  minSeverity?: string;
  escalationChannel?: string | null;
  infoIntervalMinutes?: number;
  errorRepeatMinutes?: number;
  cheburcheckIntervalMinutes?: number;
};

const SEVERITY_ORDER: Record<string, number> = { info: 0, warning: 1, critical: 2 };

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // БД имеет приоритет над .env; пустая строка удаляет переопределение.
  async value(key: NotificationCredentialKey): Promise<string | undefined> {
    const stored = await this.prisma.notificationCredential.findUnique({ where: { key } });
    if (stored) {
      try {
        return decryptSecret(stored.value);
      } catch {
        return undefined;
      }
    }
    return process.env[key] || undefined;
  }

  async configured(): Promise<Record<NotificationCredentialKey, boolean>> {
    const result = {} as Record<NotificationCredentialKey, boolean>;
    for (const key of NOTIFICATION_CREDENTIAL_KEYS) {
      result[key] = Boolean(await this.value(key));
    }
    return result;
  }

  async readableValues(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const key of NOTIFICATION_CREDENTIAL_KEYS) {
      if (!NON_SECRET_KEYS.has(key)) continue;
      const value = await this.value(key);
      if (value) result[key] = value;
    }
    return result;
  }

  async setCredentials(values: Partial<Record<NotificationCredentialKey, string>>) {
    for (const [key, value] of Object.entries(values)) {
      if (!NOTIFICATION_CREDENTIAL_KEYS.includes(key as NotificationCredentialKey)) continue;
      if (!value) {
        await this.prisma.notificationCredential.deleteMany({ where: { key } });
      } else {
        await this.prisma.notificationCredential.upsert({
          where: { key },
          create: { key, value: encryptSecret(value) },
          update: { value: encryptSecret(value) },
        });
      }
    }
    return this.configured();
  }

  async policy(): Promise<Required<NotificationPolicyData>> {
    const row = await this.prisma.notificationPolicy.findUnique({ where: { id: 'default' } });
    return {
      enabled: row?.enabled ?? true,
      quietHoursStart: row?.quietHoursStart ?? null,
      quietHoursEnd: row?.quietHoursEnd ?? null,
      cooldownMinutes: row?.cooldownMinutes ?? 0,
      minSeverity: row?.minSeverity ?? 'warning',
      escalationChannel: row?.escalationChannel ?? null,
      infoIntervalMinutes: row?.infoIntervalMinutes ?? 60,
      errorRepeatMinutes: row?.errorRepeatMinutes ?? 0,
      cheburcheckIntervalMinutes: row?.cheburcheckIntervalMinutes ?? 360,
    };
  }

  async setPolicy(patch: NotificationPolicyData) {
    const current = await this.policy();
    const next = { ...current, ...patch };
    if (next.cooldownMinutes < 0 || next.cooldownMinutes > 1440) {
      throw new Error('cooldownMinutes must be between 0 and 1440');
    }
    for (const [key, max] of [['infoIntervalMinutes', 10080], ['errorRepeatMinutes', 10080], ['cheburcheckIntervalMinutes', 10080]] as const) {
      const value = Number((next as any)[key] ?? 0);
      if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`${key} must be between 0 and ${max}`);
    }
    if (next.quietHoursStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.quietHoursStart)) {
      throw new Error('quietHoursStart must be HH:MM');
    }
    if (next.quietHoursEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.quietHoursEnd)) {
      throw new Error('quietHoursEnd must be HH:MM');
    }
    const data = {
      enabled: Boolean(next.enabled),
      quietHoursStart: next.quietHoursStart || null,
      quietHoursEnd: next.quietHoursEnd || null,
      cooldownMinutes: next.cooldownMinutes,
      minSeverity: next.minSeverity,
      escalationChannel: next.escalationChannel || null,
      infoIntervalMinutes: Number(next.infoIntervalMinutes ?? 60),
      errorRepeatMinutes: Number(next.errorRepeatMinutes ?? 0),
      cheburcheckIntervalMinutes: Number(next.cheburcheckIntervalMinutes ?? 360),
    };
    const row = await this.prisma.notificationPolicy.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return this.policy().then((policy) => ({ ...policy, updatedAt: row.updatedAt }));
  }

  isQuietHour(policy: Required<NotificationPolicyData>, at = new Date()): boolean {
    if (!policy.quietHoursStart || !policy.quietHoursEnd) return false;
    const current = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
    const start = policy.quietHoursStart;
    const end = policy.quietHoursEnd;
    return start <= end ? current >= start && current < end : current >= start || current < end;
  }

  allowsSeverity(policy: Required<NotificationPolicyData>, severity?: string): boolean {
    const value = SEVERITY_ORDER[String(severity || 'warning').toLowerCase()] ?? 1;
    return value >= (SEVERITY_ORDER[policy.minSeverity] ?? 1);
  }

  async withinCooldown(dedupeKey?: string, minutes = 0): Promise<boolean> {
    if (!dedupeKey || minutes <= 0) return false;
    if (!this.prisma.notificationDelivery?.findFirst) return false;
    const since = new Date(Date.now() - minutes * 60_000);
    const last = await this.prisma.notificationDelivery.findFirst({
      where: { dedupeKey, status: 'sent', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return Boolean(last);
  }

  async recordDelivery(input: {
    event: string;
    channel: string;
    status: string;
    dedupeKey?: string;
    error?: string;
  }) {
    return this.prisma.notificationDelivery.create({
      data: {
        event: input.event,
        channel: input.channel,
        status: input.status,
        dedupeKey: input.dedupeKey || null,
        error: input.error ? input.error.slice(0, 500) : null,
      },
    });
  }

  deliveries(limit = 50) {
    return this.prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }
}
