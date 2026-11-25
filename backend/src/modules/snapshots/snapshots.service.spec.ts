import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { SnapshotKind, SnapshotStatus } from '@prisma/client';
import { SnapshotsService } from './snapshots.service';

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('SnapshotsService', () => {
  let root: string;
  let store: Map<string, any>;
  let policy: any;
  let prisma: any;
  let audit: any;
  let service: SnapshotsService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xss-snapshots-'));
    process.env.BACKUP_DIR = root;
    process.env.SETTINGS_FILE = join(root, 'panel-settings.json');
    process.env.POSTGRES_PASSWORD = 'should-not-leak';
    writeFileSync(process.env.SETTINGS_FILE, JSON.stringify({ theme: 'dark' }));

    policy = {
      id: 'default',
      autoBeforeUpdates: true,
      autoBeforeSettings: true,
      retention: 10,
      cooldownMinutes: 15,
      updatedAt: new Date(),
    };
    store = new Map();

    prisma = {
      snapshotPolicy: {
        upsert: jest.fn().mockImplementation(async () => ({ ...policy })),
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(policy, data);
          return { ...policy };
        }),
      },
      systemSnapshot: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const record = { ...data, createdAt: new Date() };
          store.set(record.id, record);
          return record;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const record = store.get(where.id);
          Object.assign(record, data);
          store.set(where.id, record);
          return record;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => store.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          const cutoff = where.createdAt.gte as Date;
          return (
            [...store.values()].find(
              (item) =>
                where.kind === item.kind &&
                where.status.in.includes(item.status) &&
                item.createdAt >= cutoff,
            ) || null
          );
        }),
        findMany: jest.fn().mockImplementation(async () => [...store.values()]),
        delete: jest.fn().mockImplementation(async ({ where }) => {
          store.delete(where.id);
        }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new SnapshotsService(prisma, audit);
    jest.spyOn(service as any, 'dumpDatabase').mockImplementation(async (destination: string) => {
      writeFileSync(destination, Buffer.from('dump'));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.SETTINGS_FILE;
    delete process.env.POSTGRES_PASSWORD;
    jest.restoreAllMocks();
  });

  it('creates an immutable pre-update snapshot with checksums and no secret values', async () => {
    await service.beforeChange('update', 'configuration rollout', 'user-1');

    expect(prisma.systemSnapshot.create).toHaveBeenCalledTimes(1);
    const record = [...store.values()][0];
    expect(record.kind).toBe(SnapshotKind.PRE_UPDATE);
    expect(record.status).toBe(SnapshotStatus.READY);
    expect(record.checksum).toBe(sha256(Buffer.from('dump')));

    const manifestRaw = readFileSync(join(record.directory, 'manifest.json'), 'utf8');
    expect(manifestRaw).not.toContain('should-not-leak');
    expect(JSON.parse(manifestRaw).files['settings.json'].present).toBe(true);
    expect(readFileSync(join(record.directory, 'settings.json'), 'utf8')).toContain('dark');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'snapshot.created' }));
  });

  it('respects disabled auto policy', async () => {
    policy.autoBeforeSettings = false;
    await service.beforeChange('settings', 'settings change');
    expect(prisma.systemSnapshot.create).not.toHaveBeenCalled();
  });

  it('respects cooldown and does not duplicate snapshots', async () => {
    await service.beforeChange('update', 'first');
    await service.beforeChange('update', 'second');
    expect(prisma.systemSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('returns a dry-run restore plan without applying changes', async () => {
    const created = await service.create({ label: 'manual' });
    const apply = jest.spyOn(service as any, 'runSql');
    const result = await service.restore(created.id, { dryRun: true });

    expect(result.applied).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.components).toEqual(['db', 'settings']);
    expect(apply).not.toHaveBeenCalled();
    expect(store.get(created.id).status).toBe(SnapshotStatus.READY);
  });

  it('requires explicit confirmation for a real restore', async () => {
    const created = await service.create({ label: 'manual' });
    await expect(service.restore(created.id, {})).rejects.toThrow('confirm: true');
  });
});
