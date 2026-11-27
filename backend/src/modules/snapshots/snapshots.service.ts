// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SnapshotKind, SnapshotScope, SnapshotStatus, SystemSnapshot } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createGzip, gunzipSync } from 'zlib';
import { createWriteStream } from 'fs';
import * as path from 'path';
import { APP_VERSION } from '../../version';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { backupDatabaseUrl, sanitizeDatabaseError } from '../backups/backups.service';
import { RestoreComponent, RestoreSnapshotDto } from './dto/restore-snapshot.dto';
import { SnapshotPolicyDto } from './dto/snapshot-policy.dto';
import { SnapshotTriggerKind } from './snapshot-before.decorator';

export interface CreateSnapshotInput {
  label?: string;
  reason?: string;
  scope?: SnapshotScope;
  actorId?: string;
}

interface SnapshotInput {
  label?: string;
  reason?: string;
  scope?: SnapshotScope;
  kind?: SnapshotKind;
  actorId?: string;
}

interface SnapshotManifestFile {
  sha256: string;
  size: number;
  present?: boolean;
}

export interface SnapshotManifest {
  schema: number;
  id: string;
  label: string;
  kind: SnapshotKind;
  scope: SnapshotScope;
  reason: string | null;
  appVersion: string;
  createdAt: string;
  actorId: string | null;
  checksum: string;
  files: Record<string, SnapshotManifestFile>;
  env: Record<string, boolean>;
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENV_ALLOWLIST = ['NODE_ENV', 'BACKUP_DIR', 'BACKUP_KEEP', 'CORS_ORIGIN', 'PORT'];
const MAX_STDERR = 64 * 1024;

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private root(): string {
    return path.resolve(process.env.BACKUP_DIR || 'backups', 'snapshots');
  }

  private settingsPath(): string {
    return process.env.SETTINGS_FILE || path.resolve(process.env.BACKUP_DIR || 'backups', 'panel-settings.json');
  }

  private async assertInsideRoot(target: string): Promise<string> {
    const root = await fs.realpath(this.root()).catch(() => fs.mkdir(this.root(), { recursive: true }).then(() => fs.realpath(this.root())));
    const resolved = path.resolve(target);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new BadRequestException('Snapshot path is outside the snapshot directory');
    }
    return resolved;
  }

  private validateId(id: string): string {
    if (!ID_PATTERN.test(id)) throw new BadRequestException('Invalid snapshot id');
    return id;
  }

  private async findRecord(id: string) {
    const validated = this.validateId(id);
    const record = await this.prisma.systemSnapshot.findUnique({ where: { id: validated } });
    if (!record) throw new NotFoundException('Snapshot not found');
    return record;
  }

  private serialize(record: SystemSnapshot) {
    return {
      id: record.id,
      label: record.label,
      kind: record.kind,
      scope: record.scope,
      status: record.status,
      reason: record.reason,
      directory: record.directory,
      checksum: record.checksum,
      sizeBytes: record.sizeBytes,
      appVersion: record.appVersion,
      actorId: record.actorId,
      error: record.error,
      restoreError: record.restoreError,
      createdAt: record.createdAt,
      finishedAt: record.finishedAt,
      restoredAt: record.restoredAt,
    };
  }

  async getPolicy(): Promise<SnapshotPolicyDto> {
    return this.prisma.snapshotPolicy.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }

  async updatePolicy(body: SnapshotPolicyDto): Promise<SnapshotPolicyDto> {
    const current = await this.getPolicy();
    return this.prisma.snapshotPolicy.update({
      where: { id: 'default' },
      data: {
        autoBeforeUpdates: body.autoBeforeUpdates ?? current.autoBeforeUpdates,
        autoBeforeSettings: body.autoBeforeSettings ?? current.autoBeforeSettings,
        retention: body.retention ?? current.retention,
        cooldownMinutes: body.cooldownMinutes ?? current.cooldownMinutes,
      },
    });
  }

  async list() {
    const items = await this.prisma.systemSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return items.map((item) => this.serialize(item));
  }

  async get(id: string) {
    const record = await this.findRecord(id);
    const directory = await this.assertInsideRoot(record.directory);
    const manifest = await this.readManifest(directory).catch((error: any) => {
      if (error?.code === 'ENOENT') throw new NotFoundException('Snapshot files are missing');
      throw error;
    });
    const db = await fs.readFile(path.join(directory, 'db.sql.gz')).catch((error: any) => {
      if (error?.code === 'ENOENT') throw new NotFoundException('Snapshot database file is missing');
      throw error;
    });
    const checksum = sha256(db);
    return {
      ...this.serialize(record),
      integrity: checksum === record.checksum && checksum === manifest.checksum,
      manifest,
    };
  }

  async beforeChange(kind: SnapshotTriggerKind, reason: string, actorId?: string): Promise<void> {
    const policy = await this.getPolicy();
    const enabled = kind === 'update' ? policy.autoBeforeUpdates : policy.autoBeforeSettings;
    if (!enabled) return;

    const snapshotKind = kind === 'update' ? SnapshotKind.PRE_UPDATE : SnapshotKind.PRE_SETTINGS_CHANGE;
    const cutoff = new Date(Date.now() - policy.cooldownMinutes * 60_000);
    const recent = await this.prisma.systemSnapshot.findFirst({
      where: {
        kind: snapshotKind,
        status: { in: [SnapshotStatus.READY, SnapshotStatus.RESTORED] },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return;

    if (this.busy) {
      throw new ServiceUnavailableException('Snapshot operation in progress; retry the change');
    }

    try {
      await this.createInternal({
        kind: snapshotKind,
        reason,
        scope: SnapshotScope.FULL,
        actorId,
        label: `Auto before ${kind}`,
      });
    } catch (error) {
      const message = sanitizeDatabaseError(toMessage(error));
      this.logger.warn(`Auto snapshot failed: ${message}`);
      throw new ServiceUnavailableException(`Snapshot required before this change failed: ${message}`);
    }
  }

  async create(body: CreateSnapshotInput) {
    if (this.busy) throw new ServiceUnavailableException('Snapshot operation in progress');
    return this.createInternal({
      label: body.label?.trim() || 'Manual snapshot',
      reason: body.reason?.trim() || null,
      scope: body.scope ?? SnapshotScope.FULL,
      kind: SnapshotKind.MANUAL,
      actorId: body.actorId,
    });
  }

  private async createInternal(input: SnapshotInput, manageBusy = true) {
    if (manageBusy) this.busy = true;
    const id = randomUUID();
    const directory = path.join(this.root(), id);
    let recordId: string | null = null;
    try {
      await fs.mkdir(directory, { recursive: true });
      const record = await this.prisma.systemSnapshot.create({
        data: {
          id,
          label: (input.label || 'Snapshot').slice(0, 120),
          kind: input.kind ?? SnapshotKind.MANUAL,
          scope: input.scope ?? SnapshotScope.FULL,
          status: SnapshotStatus.CREATING,
          reason: input.reason?.slice(0, 500) || null,
          directory,
          checksum: '',
          appVersion: APP_VERSION,
          actorId: input.actorId || null,
        },
      });
      recordId = record.id;

      const settingsRaw = await fs.readFile(this.settingsPath()).catch(() => null);
      if (settingsRaw) await fs.writeFile(path.join(directory, 'settings.json'), settingsRaw, { mode: 0o600 });
      await this.dumpDatabase(path.join(directory, 'db.sql.gz'));

      const db = await fs.readFile(path.join(directory, 'db.sql.gz'));
      const checksum = sha256(db);
      const dbSize = db.byteLength;
      const settings = settingsRaw ? await fs.readFile(path.join(directory, 'settings.json')) : null;
      const manifest: SnapshotManifest = {
        schema: 1,
        id,
        label: record.label,
        kind: record.kind,
        scope: record.scope,
        reason: record.reason,
        appVersion: APP_VERSION,
        createdAt: new Date().toISOString(),
        actorId: input.actorId || null,
        checksum,
        files: {
          'db.sql.gz': { sha256: checksum, size: dbSize },
          'settings.json': {
            sha256: settings ? sha256(settings) : '',
            size: settings?.byteLength ?? 0,
            present: Boolean(settings),
          },
        },
        env: Object.fromEntries(ENV_ALLOWLIST.map((key) => [key, Boolean(process.env[key])])),
      };
      await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });

      const finished = await this.prisma.systemSnapshot.update({
        where: { id: recordId },
        data: {
          status: SnapshotStatus.READY,
          checksum,
          sizeBytes: dbSize,
          finishedAt: new Date(),
          error: null,
        },
      });
      void this.audit.log({
        userId: input.actorId || null,
        action: 'snapshot.created',
        entity: 'snapshot',
        entityId: finished.id,
        metadata: { label: finished.label, kind: finished.kind, scope: finished.scope },
      });
      await this.prune();
      return this.serialize(finished);
    } catch (error) {
      const message = sanitizeDatabaseError(toMessage(error));
      if (recordId) {
        await this.prisma.systemSnapshot
          .update({
            where: { id: recordId },
            data: { status: SnapshotStatus.FAILED, error: message.slice(0, 1000), finishedAt: new Date() },
          })
          .catch(() => undefined);
      }
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw new ServiceUnavailableException(`Snapshot failed: ${message}`);
    } finally {
      if (manageBusy) this.busy = false;
    }
  }

  private async dumpDatabase(destination: string): Promise<void> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const gzip = createGzip();
    const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    const finished = new Promise<void>((resolve, reject) => {
      output.once('finish', resolve);
      output.once('error', reject);
    });
    gzip.pipe(output);

    const child = spawn('pg_dump', [backupDatabaseUrl()], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(gzip);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString();
    });
    const closed = new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    const [code] = await Promise.all([closed, finished]);
    if (code !== 0) {
      throw new Error(sanitizeDatabaseError(stderr.trim()) || `pg_dump exited with code ${code}`);
    }
  }

  private async runSql(sql: Buffer): Promise<void> {
    const child = spawn('psql', [backupDatabaseUrl(), '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString();
    });
    child.stdin.end(sql);
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    if (code !== 0) {
      throw new Error(sanitizeDatabaseError(stderr.trim()) || `psql exited with code ${code}`);
    }
  }

  private async readManifest(directory: string): Promise<SnapshotManifest> {
    const target = await this.assertInsideRoot(directory);
    const raw = await fs.readFile(path.join(target, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as SnapshotManifest;
    if (parsed.schema !== 1 || !parsed.files?.['db.sql.gz']?.sha256) {
      throw new BadRequestException('Unsupported or corrupt snapshot manifest');
    }
    return parsed;
  }

  async restore(id: string, body: RestoreSnapshotDto, actorId?: string) {
    const record = await this.findRecord(id);
    const directory = await this.assertInsideRoot(record.directory);
    const manifest = await this.readManifest(directory);
    const components: RestoreComponent[] = body.components?.length
      ? body.components
      : ['db', 'settings'];

    const db = await fs.readFile(path.join(directory, 'db.sql.gz'));
    const actual = sha256(db);
    if (actual !== record.checksum || actual !== manifest.checksum) {
      throw new BadRequestException('Snapshot checksum mismatch');
    }

    const plan = {
      snapshotId: record.id,
      components,
      appVersion: record.appVersion,
      currentAppVersion: APP_VERSION,
      settingsPresent: Boolean(manifest.files['settings.json']?.present),
      sizeBytes: record.sizeBytes,
    };

    if (body.dryRun) return { ...plan, dryRun: true, applied: false };

    if (body.confirm !== true) {
      throw new BadRequestException('Restore requires confirm: true or dryRun: true');
    }
    if (this.busy) throw new ServiceUnavailableException('Snapshot operation in progress');

    this.busy = true;
    try {
      await this.createInternal({
        kind: SnapshotKind.PRE_RESTORE,
        reason: `Automatic snapshot before restoring ${record.id}`,
        scope: SnapshotScope.FULL,
        actorId,
        label: `Pre-restore ${record.id.slice(0, 8)}`,
      }, false);
      await this.prisma.systemSnapshot.update({
        where: { id: record.id },
        data: { status: SnapshotStatus.RESTORING, restoreError: null },
      });

      if (components.includes('db')) {
        await this.runSql(gunzipSync(db));
      }
      if (components.includes('settings') && manifest.files['settings.json']?.present) {
        const settings = await fs.readFile(path.join(directory, 'settings.json'));
        if (sha256(settings) !== manifest.files['settings.json'].sha256) {
          throw new BadRequestException('Snapshot settings checksum mismatch');
        }
        const target = this.settingsPath();
        await fs.mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.restore-${Date.now()}.tmp`;
        await fs.writeFile(temp, settings, { mode: 0o600 });
        await fs.rename(temp, target);
      }

      const restored = await this.prisma.systemSnapshot.update({
        where: { id: record.id },
        data: { status: SnapshotStatus.RESTORED, restoredAt: new Date() },
      });
      void this.audit.log({
        userId: actorId || null,
        action: 'snapshot.restored',
        entity: 'snapshot',
        entityId: restored.id,
        metadata: { components, label: restored.label },
      });
      return { ...plan, dryRun: false, applied: true, status: restored.status };
    } catch (error) {
      const message = sanitizeDatabaseError(toMessage(error));
      await this.prisma.systemSnapshot
        .update({
          where: { id: record.id },
          data: { status: SnapshotStatus.READY, restoreError: message.slice(0, 1000) },
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(`Restore failed: ${message}`);
    } finally {
      this.busy = false;
    }
  }

  async delete(id: string, actorId?: string) {
    const record = await this.findRecord(id);
    const directory = await this.assertInsideRoot(record.directory);
    await fs.rm(directory, { recursive: true, force: true });
    await this.prisma.systemSnapshot.delete({ where: { id: record.id } });
    void this.audit.log({
      userId: actorId || null,
      action: 'snapshot.deleted',
      entity: 'snapshot',
      entityId: record.id,
      metadata: { label: record.label },
    });
    return { ok: true };
  }

  private async prune() {
    const policy = await this.getPolicy();
    const candidates = await this.prisma.systemSnapshot.findMany({
      where: {
        kind: { not: SnapshotKind.PRE_RESTORE },
        status: { in: [SnapshotStatus.READY, SnapshotStatus.FAILED, SnapshotStatus.RESTORED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const stale of candidates.slice(policy.retention)) {
      const directory = await this.assertInsideRoot(stale.directory).catch(() => null);
      if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      await this.prisma.systemSnapshot.delete({ where: { id: stale.id } }).catch(() => undefined);
    }
  }
}
