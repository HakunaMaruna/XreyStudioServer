// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationEvent, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { isIP } from 'net';

function isPrivateIpv4(parts: number[]) {
  return (
    parts.length === 4 &&
    (parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] === 0)
  );
}

/** True for loopback, private, link-local and metadata hosts, including numeric IPv4. */
function isPrivateHost(host: string) {
  if (
    host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (isIP(host) === 4) return isPrivateIpv4(host.split('.').map(Number));

  const numeric = /^\d+$/.test(host)
    ? Number(host)
    : /^0x[0-9a-f]+$/i.test(host)
      ? Number.parseInt(host.slice(2), 16)
      : NaN;
  if (Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0xffffffff) {
    return isPrivateIpv4([24, 16, 8, 0].map((shift) => (numeric >>> shift) & 255));
  }

  if (isIP(host) === 6) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateIpv4(mapped[1].split('.').map(Number));
    // URL нормализует ::ffff:127.0.0.1 в ::ffff:7f00:1
    const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    return host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd');
  }
  return false;
}
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRoutesService } from './notification-routes.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NodeHttpService } from './node-http.service';

export type ChannelResult = { sent: boolean; reason?: string; error?: string };

export type AlertInput = {
  status: string;
  title: string;
  message?: string | null;
  severity?: string | null;
  source?: string;
  labels?: Record<string, unknown> | null;
};

export type BroadcastOptions = {
  text: string;
  plainText?: string;
  subject?: string;
  webhook?: Record<string, unknown>;
  severity?: string;
  dedupeKey?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailer?: Transporter;
  private mailerHost?: string;

  constructor(
    private prisma: PrismaService,
    private routes: NotificationRoutesService,
    private settings: NotificationSettingsService,
    private nodeHttp: NodeHttpService,
  ) {}

  // Внутренние/metadata адреса запрещены для исходящего webhook в проде.
  // Числовые и hex-формы IPv4 тоже разворачиваем: fetch понимает 2130706433
  // как 127.0.0.1, поэтому одной проверки isIP недостаточно.
  private assertWebhookUrl(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Webhook URL must use http or https');
    }
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error('Webhook URL must use https in production');
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isPrivateHost(host) && process.env.NODE_ENV === 'production') {
      throw new Error('Private webhook addresses are not allowed');
    }
    return url;
  }

  private async mailTransport(): Promise<Transporter> {
    const host = await this.settings.value('SMTP_HOST');
    if (!this.mailer || this.mailerHost !== host) {
      const user = await this.settings.value('SMTP_USER');
      this.mailer = nodemailer.createTransport({
        host,
        port: Number(await this.settings.value('SMTP_PORT') || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: user ? { user, pass: (await this.settings.value('SMTP_PASSWORD')) || '' } : undefined,
      });
      this.mailerHost = host;
    }
    return this.mailer;
  }

  /** Send through a selected node's network when the panel cannot reach the provider. */
  private async outboundRequest(target: string, method: string, headers: Record<string, string>, body?: string) {
    const nodeId = await this.settings.value('NOTIFICATION_VIA_NODE_ID');
    if (!nodeId) {
      const res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(8000), redirect: 'error' });
      const text = await res.text().catch(() => '');
      return { ok: res.ok, status: res.status, text: text.slice(0, 4000) };
    }
    return this.nodeHttp.request(nodeId, target, method, headers, body);
  }

  async sendTelegram(text: string): Promise<ChannelResult> {
    const token = await this.settings.value('TELEGRAM_BOT_TOKEN');
    const chatId = await this.settings.value('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return { sent: false, reason: 'telegram not configured' };
    try {
      const res = await this.outboundRequest(`https://api.telegram.org/bot${token}/sendMessage`, 'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }));
      if (res.ok) return { sent: true };
      // Provider errors contain a human-readable description (e.g. "chat not found").
      // Telegram never echoes the bot token in an error body, so it is safe to surface.
      let detail = '';
      try {
        const parsed = JSON.parse(res.text || '');
        if (parsed?.description) detail = `: ${String(parsed.description).slice(0, 160)}`;
      } catch {}
      if (!detail && res.text) detail = `: ${res.text.slice(0, 160)}`;
      return { sent: false, error: `Telegram HTTP ${res.status}${detail}` };
    } catch (e: any) {
      this.logger.warn(`Telegram failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  /** Sanitized Telegram diagnostics: no token or response body is returned. */
  async diagnoseTelegram() {
    const token = await this.settings.value('TELEGRAM_BOT_TOKEN');
    const chatId = await this.settings.value('TELEGRAM_CHAT_ID');
    if (!token) return { configured: false };
    const describe = (res: { ok: boolean; status: number; text: string }) => {
      let description = '';
      try {
        const parsed = JSON.parse(res.text || '');
        if (parsed?.description) description = String(parsed.description).slice(0, 200);
      } catch {}
      return { ok: res.ok, status: res.status, description: description || null };
    };
    const getMeRaw = await this.outboundRequest(`https://api.telegram.org/bot${token}/getMe`, 'GET', {});
    const getMe: any = describe(getMeRaw);
    try {
      const parsed = JSON.parse(getMeRaw.text || '');
      if (parsed?.result?.id !== undefined) getMe.id = String(parsed.result.id);
      if (parsed?.result?.username) getMe.username = String(parsed.result.username);
    } catch {}
    const updatesRaw = await this.outboundRequest(`https://api.telegram.org/bot${token}/getUpdates?limit=10`, 'GET', {});
    let firstChatId: string | null = null;
    try {
      const parsed = JSON.parse(updatesRaw.text || '');
      const update = Array.isArray(parsed?.result) ? parsed.result[0] : null;
      const chat = update?.message?.chat || update?.channel_post?.chat || update?.edited_message?.chat;
      if (chat?.id !== undefined) firstChatId = String(chat.id);
    } catch {}
    return {
      configured: true,
      chatId: chatId || null,
      chatIdLooksNumeric: Boolean(chatId && /^-?\d+$/.test(chatId.trim())),
      bot: getMe,
      updates: describe(updatesRaw),
      firstChatId,
    };
  }

  async sendWebhook(payload: Record<string, unknown>): Promise<ChannelResult> {
    const url = await this.settings.value('WEBHOOK_URL');
    if (!url) return { sent: false, reason: 'webhook not configured' };
    try {
      this.assertWebhookUrl(url);
      const body = JSON.stringify(payload);
      const secret = await this.settings.value('WEBHOOK_SECRET');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['X-XSS-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
      // Redirects could point a public webhook to a private address; never follow them.
      const res = await this.outboundRequest(url, 'POST', headers, body);
      // Тело ответа провайдера не возвращаем и не логируем — там могут быть секреты.
      return { sent: res.ok, ...(res.ok ? {} : { error: `Webhook HTTP ${res.status}` }) };
    } catch (e: any) {
      this.logger.warn(`Webhook failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendEmail(to: string | undefined, subject: string, text: string): Promise<ChannelResult> {
    const host = await this.settings.value('SMTP_HOST');
    const from = (await this.settings.value('EMAIL_FROM')) || (await this.settings.value('SMTP_USER'));
    if (!to || !host || !from) return { sent: false, reason: 'smtp not configured' };
    try {
      const transport = await this.mailTransport();
      await transport.sendMail({ from, to, subject, text });
      return { sent: true };
    } catch (e: any) {
      this.logger.warn(`Email failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendSignal(text: string): Promise<ChannelResult> {
    const url = await this.settings.value('SIGNAL_API_URL');
    const number = await this.settings.value('SIGNAL_PHONE_NUMBER');
    const recipient = await this.settings.value('SIGNAL_RECIPIENT');
    if (!url || !number || !recipient) return { sent: false, reason: 'signal not configured' };
    try {
      const res = await this.outboundRequest(`${url.replace(/\/$/, '')}/v2/send`, 'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ message: text, number, recipients: [recipient] }));
      return { sent: res.ok, ...(res.ok ? {} : { error: `Signal HTTP ${res.status}` }) };
    } catch (e: any) {
      this.logger.warn(`Signal failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async broadcast(options: BroadcastOptions, channel?: string): Promise<Record<string, ChannelResult>> {
    const plain = options.plainText || options.text.replace(/<[^>]*>/g, '');
    const emailTo = await this.settings.value('ALERT_EMAIL_TO');
    const candidates: Record<string, () => Promise<ChannelResult>> = {
      telegram: () => this.sendTelegram(options.text),
      signal: () => this.sendSignal(plain),
      webhook: () => this.sendWebhook(options.webhook || { event: 'notification', text: plain }),
      email: () => this.sendEmail(emailTo, options.subject || 'XSS notification', plain),
    };
    const entries = channel && candidates[channel] ? [channel] : Object.keys(candidates);
    const pairs = await Promise.all(entries.map(async (name) => [name, await candidates[name]()] as const));
    return Object.fromEntries(pairs);
  }

  /**
   * Event-level routing: unlike broadcast() which hits every configured channel,
   * emit() delivers only to channels explicitly enabled for the given event.
   * This is the integration point for fine-grained notification rules.
   */
  async emit(
    event: NotificationEvent,
    options: BroadcastOptions,
    organizationId?: string | null,
  ): Promise<Record<string, ChannelResult>> {
    const policy = await this.settings.policy();
    if (!policy.enabled) return { policy: { sent: false, reason: 'notifications disabled' } };
    if (!this.settings.allowsSeverity(policy, options.severity)) {
      return { policy: { sent: false, reason: `severity below ${policy.minSeverity}` } };
    }
    if (this.settings.isQuietHour(policy)) {
      return { policy: { sent: false, reason: 'quiet hours' } };
    }
    const errorEvents = ['NODE_OFFLINE', 'BACKUP_FAILED', 'CHEBURCHECK_BLOCKED', 'TRAFFIC_ALERT'];
    let cooldownMinutes = policy.cooldownMinutes;
    if (event === 'CHEBURCHECK_BLOCKED') cooldownMinutes = policy.cheburcheckIntervalMinutes;
    else if (errorEvents.includes(event)) cooldownMinutes = policy.errorRepeatMinutes === 0 ? 10080 : policy.errorRepeatMinutes;
    else cooldownMinutes = policy.infoIntervalMinutes;
    if (cooldownMinutes <= 0) return { policy: { sent: false, reason: 'event disabled by schedule' } };
    if (await this.settings.withinCooldown(options.dedupeKey || event, cooldownMinutes)) {
      return { policy: { sent: false, reason: 'cooldown' } };
    }

    const channels = await this.routes.enabledChannels(event, organizationId);
    const emailTo = await this.settings.value('ALERT_EMAIL_TO');
    const candidates: Record<string, () => Promise<ChannelResult>> = {
      telegram: () => this.sendTelegram(options.text),
      webhook: () => this.sendWebhook(options.webhook || { event, text: options.plainText || options.text }),
      email: () => this.sendEmail(emailTo, options.subject || `XSS: ${event}`, options.plainText || options.text.replace(/<[^>]*>/g, '')),
      signal: () => this.sendSignal(options.plainText || options.text.replace(/<[^>]*>/g, '')),
    };
    const result: Record<string, ChannelResult> = {};
    for (const channel of channels) {
      const name = channel.toLowerCase();
      const send = candidates[name];
      if (!send) continue;
      const outcome = await send();
      result[name] = outcome;
      await this.settings.recordDelivery({
        event,
        channel: name,
        status: outcome.sent ? 'sent' : 'failed',
        dedupeKey: options.dedupeKey,
        error: outcome.error,
      }).catch((error) => this.logger.warn(`Delivery log failed: ${error.message}`));
    }
    return result;
  }

  async channels() {
    const configured = await this.settings.configured();
    return {
      telegram: configured.TELEGRAM_BOT_TOKEN && configured.TELEGRAM_CHAT_ID,
      webhook: configured.WEBHOOK_URL,
      email: configured.SMTP_HOST && (configured.EMAIL_FROM || configured.SMTP_USER),
      signal: configured.SIGNAL_API_URL && configured.SIGNAL_PHONE_NUMBER && configured.SIGNAL_RECIPIENT,
    };
  }

  async recordAlert(alert: AlertInput) {
    return this.prisma.alertHistory.create({
      data: {
        status: alert.status,
        title: alert.title,
        message: alert.message ?? null,
        severity: alert.severity ?? null,
        source: alert.source || 'grafana',
        labels: (alert.labels ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listAlerts(query: { page?: string | number; limit?: string | number; status?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.alertHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alertHistory.count({ where }),
    ]);
    return { data, total, page, limit };
  }

}
