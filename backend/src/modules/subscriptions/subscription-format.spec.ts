import { detectSubscriptionFormat, parseSubscriptionFormat } from './subscription-format';

describe('subscription format detection', () => {
  it.each([
    ['Clash-verge/2.4.1', 'clash'],
    ['Mihomo/1.19.0', 'clash'],
    ['Happ/1.0', 'clash'],
    ['ClashforWindows/0.20', 'clash'],
    ['sing-box/1.10.0', 'singbox'],
    ['Shadowrocket/2.2.7', 'base64'],
    ['Quantumult%20X/1.0', 'base64'],
    ['Loon/2.5', 'base64'],
    ['Surge/5.8', 'base64'],
    ['Mozilla/5.0', 'json'],
    ['', 'json'],
  ])('maps %s to %s', (ua, expected) => {
    expect(detectSubscriptionFormat(ua)).toBe(expected);
  });

  it('validates explicit format overrides', () => {
    expect(parseSubscriptionFormat('raw')).toBe('raw');
    expect(parseSubscriptionFormat('<script>')).toBeNull();
    expect(parseSubscriptionFormat(undefined)).toBeNull();
  });
});
