import { randomBytes } from 'crypto';
import { TelegramBotService, TelegramUpdate } from './telegram-bot.service';
import { TelegramLoginService } from './telegram-login.service';

// Ephemeral fixtures: never reuse real credentials in tests.
const SECRET = randomBytes(32).toString('hex');
const WEBHOOK_SECRET = randomBytes(24).toString('hex');
const BOT_TOKEN_FIXTURE = randomBytes(16).toString('hex');
const TELEGRAM_ID = 123456789;

function update(text: string, id: number = TELEGRAM_ID): TelegramUpdate {
  return { update_id: 1, message: { message_id: 1, from: { id }, text } };
}

function mockFetch(): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: true, status: 200 });
}

describe('TelegramBotService', () => {
  const originalJwt = process.env.JWT_SECRET;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  let service: TelegramBotService;
  let login: TelegramLoginService;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN_FIXTURE;
    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    login = new TelegramLoginService();
    service = new TelegramBotService(login);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries({
      JWT_SECRET: originalJwt,
      TELEGRAM_BOT_TOKEN: originalToken,
      TELEGRAM_WEBHOOK_SECRET: originalSecret,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('requires a sufficiently long webhook secret', () => {
    expect(service.getWebhookSecret()).toBe(WEBHOOK_SECRET);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(() => service.getWebhookSecret()).toThrow(/16 characters/);
  });

  it('ignores all updates when no bot token is configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchFn = mockFetch();
    expect(await service.handleUpdate(update('/status'), fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns a signed one-time login token for /start', async () => {
    const fetchFn = mockFetch();
    expect(await service.handleUpdate(update('/start'), fetchFn)).toBe(true);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chat_id).toBe(TELEGRAM_ID);
    expect(body.text).toMatch(/Login token \(valid 10 min\): ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
    const token = body.text.split(': ')[1];
    expect(login.validateLoginToken(token)).toEqual({ telegramId: TELEGRAM_ID });
  });

  it('never sends a bot token or webhook secret in replies', async () => {
    const fetchFn = mockFetch();
    await service.handleUpdate(update('/start'), fetchFn);
    const url: string = fetchFn.mock.calls[0][0];
    const body = fetchFn.mock.calls[0][1].body as string;
    expect(url).toContain('/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage');
    expect(body).not.toContain(process.env.TELEGRAM_WEBHOOK_SECRET as string);
    expect(body).not.toContain('"token"');
  });

  it('does not answer /status when the telegram id is not linked', async () => {
    const fetchFn = mockFetch();
    expect(await service.handleUpdate(update('/status'), fetchFn)).toBe(true);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).text).toMatch(/not linked/i);
    expect(login.isLinked(TELEGRAM_ID)).toBe(false);
  });

  it('reports linked status after bind', async () => {
    const token = login.createLoginToken(TELEGRAM_ID);
    login.validateLoginToken(token);
    login.bindTelegram(TELEGRAM_ID, 'user-1');
    const fetchFn = mockFetch();
    await service.handleUpdate(update('/status'), fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).text).toMatch(/is linked/i);
  });

  it('answers /help and ignores unknown commands', async () => {
    const fetchFn = mockFetch();
    expect(await service.handleUpdate(update('/help'), fetchFn)).toBe(true);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).text).toMatch(/Commands/);
    fetchFn.mockClear();
    expect(await service.handleUpdate(update('hello'), fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('validates update shape strictly', () => {
    expect(service.validateUpdate(update('/start'))).toBe(TELEGRAM_ID);
    expect(service.validateUpdate(null)).toBeNull();
    expect(service.validateUpdate('bad')).toBeNull();
    expect(service.validateUpdate([])).toBeNull();
    expect(service.validateUpdate({})).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: -1 }, text: '/start' } })).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: 1.5 }, text: '/start' } })).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: '1' }, text: '/start' } })).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: 1 }, text: 42 } })).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: 1 }, text: 'x'.repeat(257) } })).toBeNull();
    expect(service.validateUpdate({ message: { from: { id: 1, is_bot: true }, text: '/start' } })).toBeNull();
  });

  it('limits each telegram id to 20 requests per minute', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 20; i++) expect(service.isRateLimited(TELEGRAM_ID, now + i)).toBe(false);
    expect(service.isRateLimited(TELEGRAM_ID, now + 20)).toBe(true);
    expect(service.isRateLimited(TELEGRAM_ID, now + 60_001)).toBe(false);
    expect(service.isRateLimited(TELEGRAM_ID + 1, now)).toBe(false);
  });
});
