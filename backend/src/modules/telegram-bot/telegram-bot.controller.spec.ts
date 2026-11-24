import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLoginService } from './telegram-login.service';

// Ephemeral fixtures: never reuse real credentials in tests.
const SECRET = randomBytes(32).toString('hex');
const WEBHOOK_SECRET = randomBytes(24).toString('hex');
const TELEGRAM_ID = 123456789;

describe('TelegramBotController', () => {
  const originalJwt = process.env.JWT_SECRET;
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  let controller: TelegramBotController;
  let bot: TelegramBotService;
  let login: TelegramLoginService;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    login = new TelegramLoginService();
    bot = new TelegramBotService(login);
    controller = new TelegramBotController(bot, login);
  });

  afterAll(() => {
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
    if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  });

  it('rejects a webhook with the wrong secret', async () => {
    const spy = jest.spyOn(bot, 'handleUpdate');
    await expect(controller.webhook('wrong-secret', {})).rejects.toThrow(UnauthorizedException);
    await expect(controller.webhook('', {})).rejects.toThrow(UnauthorizedException);
    await expect(controller.webhook(123, {})).rejects.toThrow(UnauthorizedException);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a webhook when the secret is not configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    await expect(controller.webhook(WEBHOOK_SECRET, {})).rejects.toThrow(ServiceUnavailableException);
  });

  it('accepts the correct webhook secret and forwards the body', async () => {
    const spy = jest.spyOn(bot, 'handleUpdate').mockResolvedValue(false);
    const body = { message: { from: { id: TELEGRAM_ID }, text: '/help' } };
    expect(await controller.webhook(WEBHOOK_SECRET, body)).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(body);
  });

  it('validates tokens and binds using the session user id', () => {
    const token = login.createLoginToken(TELEGRAM_ID);
    expect(controller.validate(token)).toEqual({ telegramId: TELEGRAM_ID });
    expect(() => controller.validate(token)).toThrow(/already used/);
    expect(controller.bind({ telegramId: TELEGRAM_ID }, { userId: 'user-1', email: 'u@e.com', role: 'USER' }))
      .toEqual({ linked: true, telegramId: TELEGRAM_ID });
    expect(login.isLinked(TELEGRAM_ID)).toBe(true);
  });

  it('cannot bind a Telegram id supplied by an untrusted client without a token', () => {
    expect(() =>
      controller.bind({ telegramId: TELEGRAM_ID }, { userId: 'user-1', email: 'u@e.com', role: 'USER' }),
    ).toThrow(UnauthorizedException);
    expect(login.isLinked(TELEGRAM_ID)).toBe(false);
  });

  it('rejects an unauthenticated or malformed bind request', () => {
    const token = login.createLoginToken(TELEGRAM_ID);
    login.validateLoginToken(token);
    const user = { userId: 'user-1', email: 'u@e.com', role: 'USER' };
    expect(() => controller.bind({ telegramId: TELEGRAM_ID }, { ...user, userId: '' })).toThrow(UnauthorizedException);
    expect(() => controller.bind({ telegramId: 1.5 }, user)).toThrow();
    expect(() => controller.bind(null as never, user)).toThrow();
  });
});
