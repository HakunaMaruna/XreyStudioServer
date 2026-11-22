import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async sendTelegram(text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return { sent: false, reason: 'telegram not configured' };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      return { sent: res.ok };
    } catch (e: any) {
      this.logger.warn(`Telegram failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendWebhook(payload: Record<string, unknown>) {
    const url = process.env.WEBHOOK_URL;
    if (!url) return { sent: false, reason: 'webhook not configured' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { sent: res.ok };
    } catch (e: any) {
      this.logger.warn(`Webhook failed: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  async sendEmail(to: string, subject: string, text: string) {
    // SMTP integration can be plugged in here without changing callers.
    this.logger.log(`Email to ${to}: ${subject} — ${text}`);
    return { sent: false, reason: 'email transport not configured' };
  }

  async notifyNodeOffline(node: { id: string; name: string; address: string }) {
    const text = `🔴 Node offline: <b>${node.name}</b> (${node.address})`;
    await Promise.all([
      this.sendTelegram(text),
      this.sendWebhook({ event: 'node.offline', node }),
    ]);
  }

  async notifyPayment(payment: { id: string; amount: string; currency: string; status: string }) {
    const text = `💳 Payment ${payment.id}: ${payment.amount} ${payment.currency} — ${payment.status}`;
    await Promise.all([
      this.sendTelegram(text),
      this.sendWebhook({ event: 'payment', payment }),
    ]);
  }
}
