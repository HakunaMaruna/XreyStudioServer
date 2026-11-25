import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { decryptFile, encryptFile } from './backup-crypto';

describe('backup crypto', () => {
  const key = Buffer.alloc(32, 7);
  const dir = mkdtempSync(join(tmpdir(), 'xss-backup-crypto-'));
  const source = join(dir, 'dump.sql.gz');
  const encrypted = join(dir, 'dump.sql.gz.enc');
  const restored = join(dir, 'restored.sql.gz');

  beforeAll(async () => {
    writeFileSync(source, 'backup payload'.repeat(1000));
    await encryptFile(source, encrypted, key);
  });

  it('round-trips a backup', async () => {
    await decryptFile(encrypted, restored, key);
    expect(readFileSync(restored)).toEqual(readFileSync(source));
  });

  it('rejects tampered ciphertext', async () => {
    const tampered = join(dir, 'tampered.enc');
    const data = readFileSync(encrypted);
    data[data.length - 20] ^= 0xff;
    writeFileSync(tampered, data);
    await expect(decryptFile(tampered, join(dir, 'bad.gz'), key)).rejects.toThrow();
  });
});
