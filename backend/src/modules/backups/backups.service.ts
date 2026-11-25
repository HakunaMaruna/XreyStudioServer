import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { createGzip, gunzipSync } from 'zlib';
import { createWriteStream } from 'fs';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { backupEncryptionKey, decryptFile, encryptFile } from './backup-crypto';
import { s3Enabled, uploadToS3 } from './backup-s3';
import { APP_VERSION } from '../../version';

const NAME_PATTERN = /^db-\d{8}-\d{6}\.sql\.gz(\.enc)?$/;

export function backupDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    // Prisma-specific query parameters are not understood by psql.
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('statement_cache_size');
    return url.toString();
  }
  const user = process.env.POSTGRES_USER || 'xss';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'xss');
  const host = process.env.POSTGRES_HOST || 'postgres';
  const port = process.env.POSTGRES_PORT || '5432';
  const db = process.env.POSTGRES_DB || 'xss';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

export function sanitizeDatabaseError(message: string): string {
  return message
    .replace(backupDatabaseUrl(), 'postgresql://***')
    .replace(process.env.DATABASE_URL || '\u0000', 'postgresql://***');
}

@Injectable()
export class BackupsService {
  private dir(): string {
    return path.resolve(process.env.BACKUP_DIR || 'backups');
  }

  private databaseUrl(): string {
    return backupDatabaseUrl();
  }

  private validate(name: string): string {
    if (!NAME_PATTERN.test(name)) throw new BadRequestException('Invalid backup name');
    return path.join(this.dir(), name);
  }

  private async run(command: string, args: string[], input?: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args);
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(sanitizeDatabaseError(stderr.trim()) || `${command} exited with code ${code}`));
      });
      if (input) {
        child.stdin.on('error', () => undefined);
        child.stdin.end(input);
      }
    });
  }

  // Событие снимка (manual/scheduled/pre-update/...) храним рядом с файлом:
  // так его видят и панель, и терминальное меню `xss`.
  private async readMeta(file: string): Promise<{ event?: string }> {
    try {
      const raw = await fs.readFile(`${file}.meta`, 'utf8');
      const event = raw.split('\n').find((line) => line.startsWith('event='));
      return event ? { event: event.slice('event='.length).trim() } : {};
    } catch {
      return {};
    }
  }

  private async writeMeta(file: string, event: string, note?: string) {
    const lines = [
      `event=${event.replace(/[^a-z0-9-]/gi, '') || 'manual'}`,
      `created_at=${new Date().toISOString()}`,
      `version=${APP_VERSION}`,
    ];
    if (note) lines.push(`note=${note.replace(/[\r\n]+/g, ' ').slice(0, 500)}`);
    await fs.writeFile(`${file}.meta`, `${lines.join('\n')}\n`, { mode: 0o600 });
  }

  private async removeFile(dir: string, name: string) {
    await fs.unlink(path.join(dir, name)).catch(() => undefined);
    await fs.unlink(path.join(dir, `${name}.meta`)).catch(() => undefined);
  }

  async list() {
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });
    const names = (await fs.readdir(dir)).filter((name) => NAME_PATTERN.test(name));
    const files = await Promise.all(names.map(async (name) => {
      const file = path.join(dir, name);
      const stat = await fs.stat(file);
      const meta = await this.readMeta(file);
      return {
        name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        encrypted: name.endsWith('.enc'),
        event: meta.event || 'unknown',
      };
    }));
    files.sort((a, b) => b.name.localeCompare(a.name));
    return { data: files, total: files.length };
  }

  async create(event = 'manual', note?: string) {
    const key = backupEncryptionKey();
    if (s3Enabled() && !key) {
      throw new ServiceUnavailableException('BACKUP_ENCRYPTION_KEY is required for S3 backups');
    }
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    const plainName = `db-${stamp}.sql.gz`;
    const plainFile = path.join(dir, plainName);

    await new Promise<void>((resolve, reject) => {
      const dump = spawn('pg_dump', [this.databaseUrl(), '--no-owner', '--no-privileges']);
      const gzip = createGzip();
      const out = createWriteStream(plainFile);
      let stderr = '';
      let exitCode: number | null = null;
      let finished = false;
      const settle = () => {
        if (exitCode === null || !finished) return;
        if (exitCode === 0) resolve();
        else reject(new Error(sanitizeDatabaseError(stderr.trim()) || `pg_dump exited with code ${exitCode}`));
      };
      dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      dump.on('error', (error) => { out.destroy(); reject(error); });
      out.on('error', (error) => { dump.kill(); reject(error); });
      dump.on('close', (code) => { exitCode = code; settle(); });
      out.on('finish', () => { finished = true; settle(); });
      dump.stdout.pipe(gzip).pipe(out);
    }).catch(async (error) => {
      await fs.unlink(plainFile).catch(() => undefined);
      throw error;
    });

    let name = plainName;
    let finalFile = plainFile;
    if (key) {
      name = `${plainName}.enc`;
      finalFile = path.join(dir, name);
      await encryptFile(plainFile, finalFile, key).catch(async (error) => {
        await fs.unlink(finalFile).catch(() => undefined);
        await fs.unlink(plainFile).catch(() => undefined);
        throw error;
      });
      await fs.unlink(plainFile).catch(() => undefined);
    }

    await this.writeMeta(finalFile, event, note).catch(() => undefined);

    try {
      await uploadToS3(finalFile, name);
    } catch (error) {
      throw new Error(
        `Local backup ${name} created, but S3 upload failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 7) || 7);
    const { data } = await this.list();
    for (const old of data.slice(keep)) {
      await this.removeFile(dir, old.name);
    }
    return { name, size: (await fs.stat(finalFile)).size, encrypted: Boolean(key), event };
  }

  async prune(retention: number) {
    const keep = Math.max(1, Number(retention) || 1);
    const { data } = await this.list();
    const removed: string[] = [];
    for (const old of data.slice(keep)) {
      await this.removeFile(this.dir(), old.name);
      removed.push(old.name);
    }
    return { removed };
  }

  async read(name: string): Promise<Buffer> {
    const file = this.validate(name);
    if (!name.endsWith('.enc')) return fs.readFile(file);
    const key = backupEncryptionKey();
    if (!key) throw new ServiceUnavailableException('BACKUP_ENCRYPTION_KEY is not configured');
    const temp = path.join(this.dir(), `.restore-${Date.now()}-${Math.random().toString(16).slice(2)}.gz`);
    try {
      await decryptFile(file, temp, key);
      return await fs.readFile(temp);
    } finally {
      await fs.unlink(temp).catch(() => undefined);
    }
  }

  async remove(name: string) {
    const file = this.validate(name);
    await fs.unlink(file);
    await fs.unlink(`${file}.meta`).catch(() => undefined);
    return { removed: name };
  }

  async restore(name: string) {
    const gzip = await this.read(name);
    const sql = gunzipSync(gzip);
    await this.run('psql', [this.databaseUrl(), '-v', 'ON_ERROR_STOP=1'], sql);
    return { restored: name };
  }
}
