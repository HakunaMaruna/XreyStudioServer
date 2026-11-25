import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PluginStatus, Role } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import { PluginPackage, validatePackage, verifyPackageSignature } from './plugin-package';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStorageService } from './plugin-storage.service';

const ERROR_WINDOW_MS = 5 * 60_000;
const ERROR_THRESHOLD = 5;
const statementCount = (sql: string) => sql.split(';').filter((part) => part.trim()).length;

@Injectable()
export class PluginManagerService implements OnModuleInit {
  private readonly logger = new Logger(PluginManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PluginStorageService,
    private readonly runtime: PluginRuntimeService,
    private readonly snapshots: SnapshotsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly catalog: PluginCatalogService,
  ) {}

  onModuleInit() {
    if (process.env.PLUGINS_DISABLED === 'true') {
      this.logger.warn('Plugins are disabled by PLUGINS_DISABLED');
      return;
    }
    if (process.env.PLUGIN_SAFE_MODE !== 'true') return;
    const cutoff = new Date(Date.now() - 60 * 60_000);
    this.prisma.plugin.updateMany({
      where: { status: PluginStatus.ENABLED, enabledAt: { gte: cutoff } },
      data: { status: PluginStatus.DISABLED, lastError: 'Safe mode: recently changed plugin disabled' },
    }).then((result) => {
      if (result.count) this.logger.warn(`Safe mode disabled ${result.count} recently enabled plugins`);
    }).catch((error) => this.logger.warn(`Safe mode failed: ${error.message}`));
  }

  list() {
    return this.prisma.plugin.findMany({ orderBy: { pluginId: 'asc' }, });
  }

  private async find(pluginId: string) {
    const row = await this.prisma.plugin.findUnique({ where: { pluginId } });
    if (!row) throw new NotFoundException('Plugin not found');
    return row;
  }

  private async snapshot(reason: string, actorId?: string) {
    if (process.env.PLUGIN_AUTO_SNAPSHOT === 'false') return;
    try {
      await this.snapshots.create({ label: `Before plugin: ${reason}`, reason, scope: 'FULL' as any, actorId });
    } catch (error: any) {
      throw new ForbiddenException(`Plugin change requires a snapshot, but it failed: ${error.message}`);
    }
  }

  private async auditAction(action: string, pluginId: string, actor?: AuthUser, detail?: string) {
    await this.audit.log({
      userId: actor?.userId || 'system',
      action,
      entity: 'Plugin',
      entityId: pluginId,
      metadata: detail ? { detail } : undefined,
    }).catch(() => undefined);
  }

  private async runMigrations(pluginId: string, direction: 'up' | 'down') {
    const dir = await this.storage.artifactDir(pluginId);
    const file = path.join(dir, 'migrations', `${direction}.sql`);
    const sql = await fs.readFile(file, 'utf8').catch(() => '');
    for (const statement of sql.split(';').map((item) => item.trim()).filter(Boolean)) {
      await this.prisma.$executeRawUnsafe(statement);
    }
    await this.auditAction(`plugin.migration.${direction}`, pluginId, undefined, `${statementCount(sql)} statements`);
  }

  private allowUnsigned() {
    return process.env.NODE_ENV !== 'production' && process.env.PLUGIN_ALLOW_UNSIGNED === 'true';
  }

  async install(pkg: PluginPackage, actor?: AuthUser) {
    const value = validatePackage(pkg);
    verifyPackageSignature(value, process.env.PLUGIN_STORE_PUBLIC_KEY, this.allowUnsigned());
    await this.catalog.assertNotRevoked(value.manifest.id, value.manifest.version).catch((error) => { throw new ForbiddenException(error.message); });
    await this.catalog.assertPolicyAllowed(value.manifest.id).catch((error) => { throw new ForbiddenException(error.message); });
    const existing = await this.prisma.plugin.findUnique({ where: { pluginId: value.manifest.id } });
    if (existing) throw new BadRequestException('Plugin is already installed; use update');
    await this.snapshot(`install ${value.manifest.id}`, actor?.userId);
    await this.storage.unpack(value.manifest.id, value);
    try {
      const row = await this.prisma.plugin.create({
        data: {
          pluginId: value.manifest.id,
          version: value.manifest.version,
          manifest: value.manifest as any,
          permissions: value.manifest.permissions as any,
          status: PluginStatus.INSTALLED,
          signature: value.signature as any || null,
        },
      });
      await this.runMigrations(value.manifest.id, 'up');
      await this.runtime.invoke(value.manifest.id, 'onInstall', { settings: {} });
      await this.auditAction('plugin.install', value.manifest.id, actor);
      return row;
    } catch (error: any) {
      // Best-effort rollback of any SQL the plugin already applied.
      await this.runMigrations(value.manifest.id, 'down').catch(() => undefined);
      await this.storage.removeArtifacts(value.manifest.id);
      await this.prisma.plugin.deleteMany({ where: { pluginId: value.manifest.id } });
      throw error;
    }
  }

  async enable(pluginId: string, actor?: AuthUser) {
    if (process.env.PLUGINS_DISABLED === 'true') throw new ForbiddenException('Plugins are disabled');
    const row = await this.find(pluginId);
    await this.catalog.assertNotRevoked(pluginId, row.version).catch((error) => { throw new ForbiddenException(error.message); });
    await this.catalog.assertPolicyAllowed(pluginId).catch((error) => { throw new ForbiddenException(error.message); });
    await this.snapshot(`enable ${pluginId}`, actor?.userId);
    await this.prisma.plugin.update({ where: { pluginId }, data: { status: PluginStatus.ENABLED, enabledAt: new Date(), lastError: null } });
    try {
      await this.runtime.invoke(pluginId, 'onEnable', { settings: await this.storage.settings(pluginId) });
      await this.auditAction('plugin.enable', pluginId, actor);
      return this.find(pluginId);
    } catch (error: any) {
      await this.quarantine(pluginId, `onEnable failed: ${error.message}`);
      throw error;
    }
  }

  async disable(pluginId: string, actor?: AuthUser, reason = 'manual') {
    await this.find(pluginId);
    await this.snapshot(`disable ${pluginId}`, actor?.userId);
    await this.runtime.invoke(pluginId, 'onDisable', { settings: await this.storage.settings(pluginId) }).catch(() => undefined);
    await this.prisma.plugin.update({ where: { pluginId }, data: { status: PluginStatus.DISABLED, lastError: reason === 'manual' ? null : reason } });
    await this.auditAction('plugin.disable', pluginId, actor, reason);
    return this.find(pluginId);
  }

  async quarantine(pluginId: string, reason: string) {
    await this.prisma.plugin.update({ where: { pluginId }, data: { status: PluginStatus.QUARANTINED, lastError: reason.slice(0, 500) } });
    await this.notifications.broadcast({
      text: `⚠️ Plugin <b>${pluginId}</b> quarantined: ${reason.slice(0, 300)}`,
      subject: `XSS: plugin quarantined`,
      webhook: { event: 'plugin.quarantined', pluginId, reason },
    }).catch(() => undefined);
    await this.auditAction('plugin.quarantine', pluginId, undefined, reason);
  }

  async update(pluginId: string, pkg: PluginPackage, actor?: AuthUser) {
    const value = validatePackage(pkg);
    if (value.manifest.id !== pluginId) throw new BadRequestException('Plugin id does not match');
    verifyPackageSignature(value, process.env.PLUGIN_STORE_PUBLIC_KEY, this.allowUnsigned());
    await this.catalog.assertNotRevoked(pluginId, value.manifest.version).catch((error) => { throw new ForbiddenException(error.message); });
    const row = await this.find(pluginId);
    if (row.version === value.manifest.version) throw new BadRequestException('Plugin version is unchanged');
    await this.snapshot(`update ${pluginId}`, actor?.userId);
    await this.storage.unpack(pluginId, value);
    await this.prisma.plugin.update({
      where: { pluginId },
      data: { version: value.manifest.version, manifest: value.manifest as any, permissions: value.manifest.permissions as any, signature: value.signature as any || null },
    });
    try {
      await this.runtime.invoke(pluginId, 'onUpdate', { settings: await this.storage.settings(pluginId) });
      await this.auditAction('plugin.update', pluginId, actor);
      return this.find(pluginId);
    } catch (error: any) {
      await this.quarantine(pluginId, `onUpdate failed: ${error.message}`);
      throw error;
    }
  }

  async uninstall(pluginId: string, actor?: AuthUser) {
    await this.find(pluginId);
    await this.snapshot(`uninstall ${pluginId}`, actor?.userId);
    await this.runtime.invoke(pluginId, 'onUninstall', { settings: await this.storage.settings(pluginId) }).catch(() => undefined);
    await this.runMigrations(pluginId, 'down');
    await this.storage.removeArtifacts(pluginId);
    await this.prisma.pluginStorage.deleteMany({ where: { pluginId } });
    await this.prisma.pluginLog.deleteMany({ where: { pluginId } });
    await this.prisma.plugin.delete({ where: { pluginId } });
    await this.auditAction('plugin.uninstall', pluginId, actor);
    return { removed: true };
  }

  async settings(pluginId: string) { return this.storage.settings(pluginId); }
  async setSettings(pluginId: string, value: unknown, actor?: AuthUser) {
    await this.find(pluginId);
    await this.storage.setSettings(pluginId, value);
    await this.auditAction('plugin.settings', pluginId, actor);
    return this.settings(pluginId);
  }

  async health(pluginId: string) {
    const row = await this.find(pluginId);
    if (row.status !== PluginStatus.ENABLED) return { pluginId, healthy: false, status: row.status };
    try {
      await this.runtime.invoke(pluginId, row.manifest && (row.manifest as any).healthcheck ? String((row.manifest as any).healthcheck) : 'health', {});
      await this.prisma.plugin.update({ where: { pluginId }, data: { lastHealthAt: new Date() } });
      return { pluginId, healthy: true, status: row.status };
    } catch (error: any) {
      await this.recordFailure(pluginId, `healthcheck failed: ${error.message}`);
      return { pluginId, healthy: false, status: (await this.find(pluginId)).status, error: error.message };
    }
  }

  async call(pluginId: string, action: string, payload: unknown, actor?: AuthUser) {
    const row = await this.find(pluginId);
    await this.catalog.assertNotRevoked(pluginId, row.version).catch((error) => { throw new ForbiddenException(error.message); });
    if (row.status !== PluginStatus.ENABLED) throw new ForbiddenException('Plugin is not enabled');
    const permissions = (row.manifest as any)?.permissions || [];
    if (!permissions.includes('plugins:api')) throw new ForbiddenException('Plugin has no plugins:api permission');
    if (actor && actor.role !== Role.ADMIN && actor.role !== Role.OPERATOR) throw new ForbiddenException('Insufficient permissions');
    try {
      return await this.runtime.invoke(pluginId, action, { settings: await this.storage.settings(pluginId), payload });
    } catch (error: any) {
      await this.recordFailure(pluginId, `api ${action} failed: ${error.message}`);
      throw error;
    }
  }

  async recordFailure(pluginId: string, reason: string) {
    await this.storage.log(pluginId, 'error', reason);
    const since = new Date(Date.now() - ERROR_WINDOW_MS);
    const errors = await this.prisma.pluginLog.count({ where: { pluginId, level: 'error', createdAt: { gte: since } } });
    const row = await this.find(pluginId);
    if (row.status === PluginStatus.ENABLED && errors >= ERROR_THRESHOLD) {
      await this.quarantine(pluginId, `circuit breaker: ${errors} errors in 5m`);
    } else {
      await this.prisma.plugin.update({ where: { pluginId }, data: { lastError: reason.slice(0, 500) } });
    }
  }

  async logs(pluginId: string, limit = 100) {
    return this.prisma.pluginLog.findMany({ where: { pluginId }, orderBy: { createdAt: 'desc' }, take: Math.min(500, limit) });
  }
}
