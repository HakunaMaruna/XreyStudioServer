import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { PluginManifest, PluginPackage } from './plugin-package';

const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

@Injectable()
export class PluginStorageService {
  constructor(private readonly prisma: PrismaService) {}

  private root() {
    return path.resolve(process.env.BACKUP_DIR || 'backups', 'plugins');
  }

  private assertId(pluginId: string) {
    if (!ID_RE.test(pluginId)) throw new BadRequestException('Invalid plugin id');
    return pluginId;
  }

  async artifactDir(pluginId: string) {
    const root = this.root();
    const dir = path.join(root, this.assertId(pluginId));
    if (!dir.startsWith(`${root}${path.sep}`)) throw new BadRequestException('Unsafe plugin path');
    return dir;
  }

  async unpack(pluginId: string, pkg: PluginPackage) {
    const dir = await this.artifactDir(pluginId);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(pkg.files)) {
      if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
        throw new BadRequestException(`Unsafe plugin path: ${name}`);
      }
      const target = path.resolve(dir, name);
      if (!target.startsWith(`${dir}${path.sep}`) && target !== dir) throw new BadRequestException('Unsafe plugin path');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(content, 'base64'), { mode: 0o600 });
    }
    await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify(pkg.manifest, null, 2));
    return dir;
  }

  async removeArtifacts(pluginId: string) {
    const dir = await this.artifactDir(pluginId);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async manifest(pluginId: string): Promise<PluginManifest | null> {
    try {
      const raw = await fs.readFile(path.join(await this.artifactDir(pluginId), 'plugin.json'), 'utf8');
      return JSON.parse(raw) as PluginManifest;
    } catch {
      return null;
    }
  }

  private unwrap(value: unknown): any {
    if (value && typeof value === 'object' && (value as any).encrypted) {
      try { return JSON.parse(decryptSecret(String((value as any).encrypted))); } catch { return {}; }
    }
    return value || {};
  }

  async settings(pluginId: string) {
    const row = await this.prisma.plugin.findUnique({ where: { pluginId: this.assertId(pluginId) } });
    return this.unwrap(row?.settings);
  }

  async setSettings(pluginId: string, value: unknown) {
    return this.prisma.plugin.update({
      where: { pluginId: this.assertId(pluginId) },
      data: { settings: { encrypted: encryptSecret(JSON.stringify(value || {})) } as any },
    });
  }

  async get(pluginId: string, key: string) {
    const row = await this.prisma.pluginStorage.findUnique({ where: { pluginId_key: { pluginId: this.assertId(pluginId), key } } });
    return this.unwrap(row?.value);
  }

  async set(pluginId: string, key: string, value: unknown) {
    await this.prisma.pluginStorage.upsert({
      where: { pluginId_key: { pluginId: this.assertId(pluginId), key } },
      create: { pluginId, key, value: { encrypted: encryptSecret(JSON.stringify(value)) } as any },
      update: { value: { encrypted: encryptSecret(JSON.stringify(value)) } as any },
    });
  }

  async delete(pluginId: string, key: string) {
    await this.prisma.pluginStorage.deleteMany({ where: { pluginId: this.assertId(pluginId), key } });
  }

  async log(pluginId: string, level: string, message: string) {
    await this.prisma.pluginLog.create({ data: { pluginId: this.assertId(pluginId), level: level.slice(0, 32), message: message.slice(0, 1000) } });
  }
}
