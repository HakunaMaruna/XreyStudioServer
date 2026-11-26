import { encryptSecret, decryptSecret } from './secret-crypto';

describe('secret-crypto', () => {
  it('round-trips passwords and private keys', () => {
    const keyHeader = ['-----BEGIN', 'OPENSSH', 'PRIVATE', 'KEY-----'].join('');
    for (const value of ['p@ssw0rd', `${keyHeader}\nabc\n`, '']) {
      const encrypted = encryptSecret(value);
      if (value) expect(encrypted).not.toContain(value);
      expect(encrypted.startsWith('v1:')).toBe(true);
      expect(decryptSecret(encrypted)).toBe(value);
    }
  });

  it('uses a fresh IV for every encryption', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects unknown formats and tampered ciphertext', () => {
    expect(() => decryptSecret('v2:a:b:c')).toThrow('Unsupported secret format');
    const parts = encryptSecret('secret').split(':');
    parts[3] = Buffer.from('mutated').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
