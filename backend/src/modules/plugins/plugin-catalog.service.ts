import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EnvAuthProvider } from './auth-provider';

const TTL_MS = 5 * 60_000;

@Injectable()
export class PluginCatalogService {
  private readonly logger = new Logger(PluginCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: EnvAuthProvider,
  ) {}

  private async storeUrl(path: string) {
    const base = (process.env.STORE_API_URL || '').replace(/\/$/, '');
    return `${base}${path}`;
  }

  private async controlUrl(path: string) {
    const base = (process.env.CONTROL_API_URL || '').replace(/\/$/, '');
    return `${base}${path}`;
  }

  private async fetchCatalog(): Promise<{ body: any; etag: string | null }> {
    if (this.auth.mode() === 'control') {
      const headers: Record<string, string> = {};
      const token = this.auth.masterToken();
      if (token) headers['X-Store-Token'] = token;
      const response = await fetch(await this.storeUrl('/api/store/plugins'), {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Store responded ${response.status}`);
      return { body: await response.json(), etag: response.headers.get('etag') };
    }
    const headers: Record<string, string> = {};
    const token = this.auth.tenantToken();
    if (token) headers['X-API-Token'] = token;
    const response = await fetch(await this.controlUrl('/api/control/plugins/catalog'), {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Master responded ${response.status}`);
    return { body: await response.json(), etag: response.headers.get('etag') };
  }

  async get() {
    const cached = await this.prisma.pluginCatalogCache.findUnique({ where: { id: 'default' } });
    const fresh = cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS && !cached.offline;
    if (fresh) return { ...(cached.body as any), cached: true, offline: false };
    try {
      const { body, etag } = await this.fetchCatalog();
      await this.prisma.pluginCatalogCache.upsert({
        where: { id: 'default' },
        create: { id: 'default', etag, body: body as any, fetchedAt: new Date(), offline: false },
        update: { etag, body: body as any, fetchedAt: new Date(), offline: false },
      });
      return { ...body, cached: false, offline: false };
    } catch (error: any) {
      this.logger.warn(`Catalog unavailable, using cache: ${error.message}`);
      if (cached) return { ...(cached.body as any), cached: true, offline: true };
      return { plugins: [], categories: [], cached: false, offline: true, error: error.message };
    }
  }

  async refresh() {
    await this.prisma.pluginCatalogCache.deleteMany({ where: { id: 'default' } });
    return this.get();
  }

  async masterCatalog() {
    // CONTROL endpoint called by tenants: apply master policy to store data.
    const response = await fetch(await this.storeUrl('/api/store/plugins'), {
      headers: this.auth.masterToken() ? { 'X-Store-Token': this.auth.masterToken() } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Store responded ${response.status}`);
    const body: any = await response.json();
    const policy = await this.prisma.pluginPolicy.findUnique({ where: { id: 'default' } });
    const whitelist = (policy?.whitelist as string[]) || null;
    const blacklist = new Set((policy?.blacklist as string[]) || []);
    const mandatory = new Set((policy?.mandatory as string[]) || []);
    const plugins = (body.plugins || []).filter((plugin: any) =>
      !blacklist.has(plugin.id) && (!whitelist || whitelist.includes(plugin.id) || mandatory.has(plugin.id)));
    return { ...body, plugins, policy: { mandatory: [...mandatory], blacklist: [...blacklist] } };
  }

  async downloadUrl(versionId: string) {
    const token = this.auth.mode() === 'control' ? this.auth.masterToken() : this.auth.tenantToken();
    const path = this.auth.mode() === 'control'
      ? `/api/store/versions/${encodeURIComponent(versionId)}/download`
      : `/api/control/plugins/download/${encodeURIComponent(versionId)}`;
    const base = this.auth.mode() === 'control' ? (process.env.STORE_API_URL || '').replace(/\/$/, '') : (process.env.CONTROL_API_URL || '').replace(/\/$/, '');
    const response = await fetch(`${base}${path}`, {
      headers: token ? (this.auth.mode() === 'control' ? { 'X-Store-Token': token } : { 'X-API-Token': token }) : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.json();
  }

  async policy() {
    return this.prisma.pluginPolicy.upsert({ where: { id: 'default' }, create: {}, update: {} });
  }

  async updatePolicy(data: Record<string, unknown>) {
    const current = await this.policy();
    return this.prisma.pluginPolicy.update({
      where: { id: 'default' },
      data: {
        whitelist: (data.whitelist ?? current.whitelist) as any,
        blacklist: (data.blacklist ?? current.blacklist) as any,
        mandatory: (data.mandatory ?? current.mandatory) as any,
        forcedUpdates: (data.forcedUpdates ?? current.forcedUpdates) as any,
      },
    });
  }
}
