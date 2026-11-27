// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getJwtSecret } from '../../common/env';

export const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_VERSION = 1;
const NONCE_BYTES = 16;
const MAX_TOKEN_LENGTH = 1024;
const MAX_STORE_ENTRIES = 10_000;

interface LoginPayload {
  v: number;
  tg: number;
  exp: number;
  n: string;
}

interface PendingLogin {
  nonce: string;
  expiresAt: number;
}

/** Stateless signed login links with in-process one-time nonce tracking. */
@Injectable()
export class TelegramLoginService {
  private readonly usedNonces = new Map<string, number>();
  private readonly pendingLogins = new Map<number, PendingLogin>();
  private readonly bindings = new Map<number, string>();

  /** Signs a short-lived, single-use login token for a Telegram user id. */
  createLoginToken(telegramId: number, now = Date.now()): string {
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      throw new BadRequestException('Invalid Telegram user id');
    }
    const payload: LoginPayload = {
      v: TOKEN_VERSION,
      tg: telegramId,
      exp: now + LOGIN_TOKEN_TTL_MS,
      n: randomBytes(NONCE_BYTES).toString('hex'),
    };
    const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', getJwtSecret()).update(payloadPart).digest('base64url');
    return `${payloadPart}.${signature}`;
  }

  /**
   * Verifies the HMAC, expiry and one-time nonce, then records a pending login.
   * Only the Telegram id is returned; panel identity is established by bind().
   */
  validateLoginToken(token: unknown): { telegramId: number } {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new BadRequestException('Invalid login token');
    }
    const [payloadPart, signaturePart] = token.split('.');
    const expected = createHmac('sha256', getJwtSecret()).update(payloadPart).digest();
    const actual = Buffer.from(signaturePart, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Invalid login token');
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid login token');
    }
    const payload = this.parsePayload(decoded);
    const now = Date.now();
    if (payload.exp <= now || payload.exp > now + LOGIN_TOKEN_TTL_MS) {
      throw new UnauthorizedException('Login token expired');
    }
    this.sweep(this.usedNonces, now);
    if (this.usedNonces.has(payload.n)) {
      throw new UnauthorizedException('Login token already used');
    }

    // Check and mark in one synchronous step: a token can only be redeemed once.
    this.trimStore(this.usedNonces);
    this.usedNonces.set(payload.n, payload.exp);
    this.trimStore(this.pendingLogins);
    this.pendingLogins.set(payload.tg, { nonce: payload.n, expiresAt: payload.exp });
    return { telegramId: payload.tg };
  }

  /**
   * Links a validated Telegram id to the authenticated panel user.
   * userId comes from the JWT session, never from the request body.
   */
  bindTelegram(telegramId: unknown, userId: unknown): { linked: true; telegramId: number } {
    if (!Number.isSafeInteger(telegramId) || (telegramId as number) <= 0) {
      throw new BadRequestException('Invalid Telegram user id');
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new UnauthorizedException('Authenticated user required');
    }
    const id = telegramId as number;
    const existing = this.bindings.get(id);
    if (existing && existing !== userId) {
      throw new ForbiddenException('Telegram id is linked to another account');
    }
    const now = Date.now();
    this.sweep(this.pendingLogins, now, (entry) => entry.expiresAt);
    const pending = this.pendingLogins.get(id);
    if (!pending || pending.expiresAt <= now || !this.usedNonces.has(pending.nonce)) {
      throw new UnauthorizedException('Telegram id was not validated by a fresh login token');
    }
    this.pendingLogins.delete(id);
    this.bindings.set(id, userId);
    return { linked: true, telegramId: id };
  }

  isLinked(telegramId: number): boolean {
    return Number.isSafeInteger(telegramId) && this.bindings.has(telegramId);
  }

  private parsePayload(value: unknown): LoginPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Invalid login token');
    }
    const p = value as Record<string, unknown>;
    if (p.v !== TOKEN_VERSION || !Number.isSafeInteger(p.tg) || (p.tg as number) <= 0 ||
        !Number.isSafeInteger(p.exp) || typeof p.n !== 'string' ||
        !/^[0-9a-f]{32}$/.test(p.n)) {
      throw new BadRequestException('Invalid login token');
    }
    return { v: TOKEN_VERSION, tg: p.tg as number, exp: p.exp as number, n: p.n };
  }

  private sweep<V>(
    store: Map<unknown, V>,
    now: number,
    expiryOf: (value: V) => number = (value) => value as unknown as number,
  ): void {
    for (const [key, value] of store) {
      if (expiryOf(value) <= now) store.delete(key);
    }
  }

  private trimStore(store: Map<unknown, unknown>): void {
    if (store.size < MAX_STORE_ENTRIES) return;
    // Drop the oldest entries; stores are bounded to avoid unbounded memory growth.
    let toRemove = store.size - MAX_STORE_ENTRIES + 1;
    for (const key of store.keys()) {
      store.delete(key);
      if (--toRemove <= 0) break;
    }
  }
}
