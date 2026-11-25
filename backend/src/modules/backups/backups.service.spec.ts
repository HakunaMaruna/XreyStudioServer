import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { BadRequestException } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { encryptFile } from './backup-crypto';

describe('BackupsService', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xss-backups-'));
  const key = Buffer.alloc(32, 11).toString('base64');
  const service = new BackupsService();

  beforeAll(async () => {
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_ENCRYPTION_KEY = key;
    delete process.env.BACKUP_S3_BUCKET;
    writeFileSync(join(dir, 'db-20260101-000000.sql.gz'), gzipSync('old'));
    writeFileSync(join(dir, 'db-20260101-000000.sql.gz.meta'), 'event=scheduled\n');
    const raw = join(dir, 'raw.sql');
    writeFileSync(raw, gzipSync('payload'));
    await encryptFile(raw, join(dir, 'db-20260102-000000.sql.gz.enc'), Buffer.from(key, 'base64'));
  });

  it('lists encrypted and legacy backups', async () => {
    const { data } = await service.list();
    expect(data.map((item) => item.name).sort()).toEqual([
      'db-20260101-000000.sql.gz',
      'db-20260102-000000.sql.gz.enc',
    ]);
    expect(data.find((item) => item.name.endsWith('.enc'))?.encrypted).toBe(true);
    expect(data.find((item) => item.name === 'db-20260101-000000.sql.gz')?.event).toBe('scheduled');
    expect(data.find((item) => item.name.endsWith('.enc'))?.event).toBe('unknown');
  });

  it('decrypts an encrypted backup on read', async () => {
    const content = await service.read('db-20260102-000000.sql.gz.enc');
    expect(content.length).toBeGreaterThan(0);
  });

  it('rejects path traversal in names', async () => {
    await expect(service.read('../etc/passwd')).rejects.toThrow(BadRequestException);
  });

  it('removes the sidecar metadata with the snapshot', async () => {
    const name = 'db-20260103-000000.sql.gz';
    writeFileSync(join(dir, name), gzipSync('old'));
    writeFileSync(join(dir, `${name}.meta`), 'event=manual\n');
    await service.remove(name);
    expect(existsSync(join(dir, name))).toBe(false);
    expect(existsSync(join(dir, `${name}.meta`))).toBe(false);
  });
});
