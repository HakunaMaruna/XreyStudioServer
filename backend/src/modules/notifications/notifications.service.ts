import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationEvent, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRoutesService } from './notification-routes.service';

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
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailer?: Transporter;

  constructor(
    private prisma: PrismaService,
    private routes: NotificationRoutesService,
  ) {}

  private get mailTransport(): Transporter {
    if (!this.mailer) {
      this.mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
          : undefined,
      });
    }
    return this.mailer;
  }

  async sendTelegram(text: string): Promise<ChannelResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return { sent: false, reason: 'telegram not configured' };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      return { sent: res.ok, ...(res.ok ? {} : { error: await res.text() }) };
    } catch (e: any) {
      this.logger.warn(`Telegram failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendWebhook(payload: Record<string, unknown>): Promise<ChannelResult> {
    const url = process.env.WEBHOOK_URL;
    if (!url) return { sent: false, reason: 'webhook not configured' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { sent: res.ok, ...(res.ok ? {} : { error: await res.text() }) };
    } catch (e: any) {
      this.logger.warn(`Webhook failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendEmail(to: string | undefined, subject: string, text: string): Promise<ChannelResult> {
    const host = process.env.SMTP_HOST;
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    if (!to || !host || !from) return { sent: false, reason: 'smtp not configured' };
    try {
      await this.mailTransport.sendMail({ from, to, subject, text });
      return { sent: true };
    } catch (e: any) {
      this.logger.warn(`Email failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendSignal(text: string): Promise<ChannelResult> {
    const url = process.env.SIGNAL_API_URL;
    const number = process.env.SIGNAL_PHONE_NUMBER;
    const recipient = process.env.SIGNAL_RECIPIENT;
    if (!url || !number || !recipient) return { sent: false, reason: 'signal not configured' };
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/v2/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, number, recipients: [recipient] }),
      });
      return { sent: res.ok, ...(res.ok ? {} : { error: await res.text() }) };
    } catch (e: any) {
      this.logger.warn(`Signal failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async broadcast(options: BroadcastOptions): Promise<Record<string, ChannelResult>> {
    const plain = options.plainText || options.text.replace(/<[^>]*>/g, '');
    const [telegram, signal, webhook, email] = await Promise.all([
      this.sendTelegram(options.text),
      this.sendSignal(plain),
      this.sendWebhook(options.webhook || { event: 'notification', text: plain }),
      this.sendEmail(process.env.ALERT_EMAIL_TO, options.subject || 'XSS notification', plain),
    ]);
    return { telegram, signal, webhook, email };
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
    const channels = await this.routes.enabledChannels(event, organizationId);
    const result: Record<string, ChannelResult> = {};
    if (channels.includes(NotificationChannel.TELEGRAM)) {
      result.telegram = await this.sendTelegram(options.text);
    }
    if (channels.includes(NotificationChannel.WEBHOOK)) {
      result.webhook = await this.sendWebhook(options.webhook || { event, text: options.plainText || options.text });
    }
    if (channels.includes(NotificationChannel.EMAIL)) {
      result.email = await this.sendEmail(
        process.env.ALERT_EMAIL_TO,
        options.subject || `XSS: ${event}`,
        options.plainText || options.text.replace(/<[^>]*>/g, ''),
      );
    }
    return result;
  }

  channels() {
    return {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      webhook: Boolean(process.env.WEBHOOK_URL),
      email: Boolean(process.env.SMTP_HOST && (process.env.EMAIL_FROM || process.env.SMTP_USER)),
      signal: Boolean(process.env.SIGNAL_API_URL && process.env.SIGNAL_PHONE_NUMBER && process.env.SIGNAL_RECIPIENT),
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
