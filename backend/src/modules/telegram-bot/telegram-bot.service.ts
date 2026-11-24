import { Injectable, Logger } from '@nestjs/common';
import { TelegramLoginService } from './telegram-login.service';

const BOT_API = 'https://api.telegram.org/bot';
const MIN_WEBHOOK_SECRET_LENGTH = 16;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const MAX_MESSAGE_LENGTH = 256;

interface TelegramUser {
  id: number;
  is_bot?: boolean;
}

interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  text?: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

/** Handles Telegram webhook updates and replies via the Bot API. */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly hits = new Map<number, number[]>();

  constructor(private readonly login: TelegramLoginService) {}

  /** True when a token is configured; otherwise all updates are ignored. */
  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }

  getWebhookSecret(): string {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (secret.length < MIN_WEBHOOK_SECRET_LENGTH) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be at least 16 characters long');
    }
    return secret;
  }

  /** Validates the update shape; returns the telegram id or null for non-command updates. */
  validateUpdate(body: unknown): number | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const update = body as TelegramUpdate;
    const message = update.message;
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const from = message.from;
    if (!from || typeof from !== 'object' || Array.isArray(from)) return null;
    if (!Number.isSafeInteger(from.id) || from.id <= 0 || from.is_bot === true) return null;
    if (typeof message.text !== 'string' || message.text.length === 0 ||
        message.text.length > MAX_MESSAGE_LENGTH) return null;
    return from.id;
  }

  isRateLimited(telegramId: number, now = Date.now()): boolean {
    const recent = (this.hits.get(telegramId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      this.hits.set(telegramId, recent);
      return true;
    }
    recent.push(now);
    this.hits.set(telegramId, recent);
    if (this.hits.size > 10_000) {
      for (const [id, times] of this.hits) {
        if (!times.length || now - times[times.length - 1] >= RATE_LIMIT_WINDOW_MS) {
          this.hits.delete(id);
        }
      }
    }
    return false;
  }

  /** Processes a validated update. Returns false when no reply was sent. */
  async handleUpdate(body: unknown, fetchFn: typeof fetch = fetch): Promise<boolean> {
    const telegramId = this.validateUpdate(body);
    if (telegramId === null || !this.isConfigured() || this.isRateLimited(telegramId)) {
      return false;
    }
    const text = (body as TelegramUpdate).message!.text!.trim();
    const command = text.split(/\s/, 1)[0].split('@')[0].toLowerCase();
    const reply = await this.replyFor(command, telegramId);
    if (reply === null) return false;
    return this.sendMessage(telegramId, reply, fetchFn);
  }

  private async replyFor(command: string, telegramId: number): Promise<string | null> {
    switch (command) {
      case '/start': {
        // Only the opaque token is sent; the frontend builds the /login?tg= URL.
        const token = this.login.createLoginToken(telegramId);
        return `Login token (valid 10 min): ${token}`;
      }
      case '/help':
        return 'Commands: /start link account, /status check link, /help this help.';
      case '/status':
        return this.login.isLinked(telegramId)
          ? 'Your Telegram account is linked.'
          : 'Your Telegram account is not linked. Use /start.';
      default:
        return null;
    }
  }

  private async sendMessage(
    chatId: number,
    text: string,
    fetchFn: typeof fetch,
  ): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return false;
    try {
      const res = await fetchFn(`${BOT_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) {
        this.logger.warn(`Telegram reply failed with status ${res.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Telegram reply failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return false;
    }
  }
}
