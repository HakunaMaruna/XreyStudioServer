import { normalizeHwid } from './hwid';

describe('normalizeHwid', () => {
  it('accepts absent values and typical HWIDs', () => {
    expect(normalizeHwid(undefined)).toBeUndefined();
    expect(normalizeHwid('')).toBeUndefined();
    expect(normalizeHwid('device-A')).toBe('device-A');
    expect(normalizeHwid('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects malformed or oversized values', () => {
    expect(() => normalizeHwid('x')).toThrow();
    expect(() => normalizeHwid('bad hwid')).toThrow();
    expect(() => normalizeHwid('a'.repeat(129))).toThrow();
    expect(() => normalizeHwid(42)).toThrow();
  });
});
