// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TelegramLoginService } from './telegram-login.service';

// Ephemeral fixtures: never reuse real credentials in tests.
const SECRET = randomBytes(32).toString('hex');
const TELEGRAM_ID = 123456789;

describe('TelegramLoginService', () => {
  const originalSecret = process.env.JWT_SECRET;
  let service: TelegramLoginService;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    service = new TelegramLoginService();
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('issues an HMAC-SHA256 token bound to the telegram id', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    const { validateLoginToken } = new TelegramLoginService();
    expect(validateLoginToken.call(service, token)).toEqual({ telegramId: TELEGRAM_ID });
  });

  it('rejects a token with a forged signature', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    const [payload, signature] = token.split('.');
    const forged = signature[0] === 'A' ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    expect(() => service.validateLoginToken(`${payload}.${forged}`)).toThrow(UnauthorizedException);
  });

  it('rejects a token signed with another secret', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    expect(() => service.validateLoginToken(token)).toThrow(UnauthorizedException);
  });

  it('rejects a tampered payload', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    const [payload, signature] = token.split('.');
    const changed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    changed.tg = TELEGRAM_ID + 1;
    const changedPart = Buffer.from(JSON.stringify(changed)).toString('base64url');
    expect(() => service.validateLoginToken(`${changedPart}.${signature}`)).toThrow(UnauthorizedException);
  });

  it('allows a token to be redeemed only once', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    expect(service.validateLoginToken(token)).toEqual({ telegramId: TELEGRAM_ID });
    expect(() => service.validateLoginToken(token)).toThrow(/already used/);
  });

  it('rejects an expired token', () => {
    const now = 1_700_000_000_000;
    const token = service.createLoginToken(TELEGRAM_ID, now);
    expect(() => service.validateLoginToken(token)).toThrow(/expired/);
  });

  it('rejects a token from the future', () => {
    const token = service.createLoginToken(TELEGRAM_ID, Date.now() + 60 * 60 * 1000);
    expect(() => service.validateLoginToken(token)).toThrow(/expired/);
  });

  it('binds only a freshly validated telegram id to the session user', () => {
    const token = service.createLoginToken(TELEGRAM_ID);
    expect(() => service.bindTelegram(TELEGRAM_ID, 'user-1')).toThrow(/not validated/);
    service.validateLoginToken(token);
    expect(service.bindTelegram(TELEGRAM_ID, 'user-1')).toEqual({ linked: true, telegramId: TELEGRAM_ID });
    expect(service.isLinked(TELEGRAM_ID)).toBe(true);
    expect(() => service.bindTelegram(TELEGRAM_ID, 'user-2')).toThrow(/another account/);
  });

  it('rejects malformed input', () => {
    expect(() => service.createLoginToken(-1)).toThrow();
    expect(() => service.validateLoginToken(123)).toThrow();
    expect(() => service.validateLoginToken('')).toThrow();
    expect(() => service.validateLoginToken('x'.repeat(2000))).toThrow();
    expect(() => service.bindTelegram('123', 'user-1')).toThrow();
    expect(() => service.bindTelegram(TELEGRAM_ID, '')).toThrow();
    expect(service.isLinked(0)).toBe(false);
  });
});
