import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { StorePluginStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PluginPackage, sha256Package, validatePackage } from '../plugins/plugin-package';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(token: string | undefined) {
    const expected = process.env.STORE_ADMIN_TOKEN || '';
    if (!expected || token !== expected) throw new UnauthorizedException('Invalid store admin token');
  }

  async adminList() {
    return this.prisma.storePlugin.findMany({
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(query: { search?: string; category?: string }) {
    const plugins = await this.prisma.storePlugin.findMany({
      where: {
        status: StorePluginStatus.PUBLISHED,
        ...(query.category ? { category: query.category } : {}),
        ...(query.search ? { OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ] } : {}),
      },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
    const revoked = new Set((await this.prisma.storeRevocation.findMany()).map((item) => item.pluginId));
    return {
      plugins: plugins.map((plugin) => ({
        id: plugin.slug,
        name: plugin.name,
        author: plugin.author,
        description: plugin.description,
        category: plugin.category,
        iconUrl: plugin.iconUrl,
        screenshots: plugin.screenshots,
        rating: plugin.rating,
        latestVersion: plugin.versions[0]?.version || null,
        versionId: plugin.versions[0]?.id || null,
        manifest: plugin.versions[0]?.manifest || null,
        compatibility: plugin.versions[0]?.compatibility || null,
        revoked: revoked.has(plugin.id),
      })),
      categories: Array.from(new Set(plugins.map((plugin) => plugin.category))).sort(),
    };
  }

  async details(slug: string) {
    const plugin = await this.prisma.storePlugin.findUnique({
      where: { slug },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!plugin) throw new NotFoundException('Plugin not found');
    return {
      id: plugin.slug,
      name: plugin.name,
      author: plugin.author,
      description: plugin.description,
      category: plugin.category,
      iconUrl: plugin.iconUrl,
      screenshots: plugin.screenshots,
      rating: plugin.rating,
      status: plugin.status,
      versions: plugin.versions.map((version) => ({
        id: version.id,
        version: version.version,
        manifest: version.manifest,
        sha256: version.sha256,
        signature: version.signature,
        changelog: version.changelog,
        compatibility: version.compatibility,
        createdAt: version.createdAt,
      })),
    };
  }

  async download(versionId: string) {
    const version = await this.prisma.storeVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Version not found');
    return version.payload;
  }

  async checkUpdates(versions: Record<string, string>) {
    const result: Record<string, { version: string; url: string } | null> = {};
    for (const [slug, current] of Object.entries(versions)) {
      const plugin = await this.prisma.storePlugin.findUnique({ where: { slug }, include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      const latest = plugin?.versions[0];
      result[slug] = latest && latest.version !== current
        ? { version: latest.version, url: `/api/store/versions/${latest.id}/download` }
        : null;
    }
    return result;
  }

  async publish(body: {
    slug: string; name: string; author: string; description: string;
    category?: string; iconUrl?: string; screenshots?: unknown; pkg: PluginPackage;
    changelog?: string; status?: StorePluginStatus; adminToken?: string;
  }, adminToken?: string) {
    this.assertAdmin(adminToken || body.adminToken);
    const pkg = validatePackage(body.pkg);
    const manifest = pkg.manifest;
    if (manifest.id !== body.slug) throw new BadRequestException('slug must match manifest id');
    const plugin = await this.prisma.storePlugin.upsert({
      where: { slug: body.slug },
      create: {
        slug: body.slug,
        name: body.name,
        author: body.author,
        description: body.description,
        category: body.category || 'utility',
        iconUrl: body.iconUrl || null,
        screenshots: (body.screenshots || null) as any,
        status: body.status || StorePluginStatus.DRAFT,
      },
      update: {
        name: body.name,
        author: body.author,
        description: body.description,
        category: body.category || 'utility',
        iconUrl: body.iconUrl || null,
        screenshots: (body.screenshots || null) as any,
        status: body.status || StorePluginStatus.DRAFT,
      },
    });
    const checksum = sha256Package(pkg);
    const version = await this.prisma.storeVersion.upsert({
      where: { pluginId_version: { pluginId: plugin.id, version: manifest.version } },
      create: {
        pluginId: plugin.id,
        version: manifest.version,
        manifest: manifest as any,
        payload: pkg as any,
        sha256: checksum,
        signature: (pkg.signature || null) as any,
        changelog: body.changelog || null,
        compatibility: { minPanelVersion: manifest.minPanelVersion, maxPanelVersion: manifest.maxPanelVersion || null } as any,
      },
      update: {
        manifest: manifest as any,
        payload: pkg as any,
        sha256: checksum,
        signature: (pkg.signature || null) as any,
        changelog: body.changelog || null,
      },
    });
    return { pluginId: plugin.slug, version: version.version, status: plugin.status, sha256: checksum };
  }

  async setStatus(slug: string, status: StorePluginStatus, adminToken?: string) {
    this.assertAdmin(adminToken);
    return this.prisma.storePlugin.update({ where: { slug }, data: { status } });
  }

  async revoke(slug: string, version: string | null, reason: string | null, adminToken?: string) {
    this.assertAdmin(adminToken);
    return this.prisma.storeRevocation.create({ data: { pluginId: slug, version, reason } });
  }

  async revocations() {
    return this.prisma.storeRevocation.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  }
}
