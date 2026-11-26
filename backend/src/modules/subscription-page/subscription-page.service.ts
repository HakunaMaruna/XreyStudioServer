import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export type PageSettings = {
  brand: string;
  title: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  accent: string;
  background: string;
  defaultTheme: 'auto' | 'dark' | 'light';
  customCss: string;
  blocks: Record<'qr' | 'traffic' | 'expiry' | 'apps' | 'instructions' | 'support', boolean>;
  support: { telegram: string; website: string; email: string };
  announcement: string;
  defaultLanguage: 'ru' | 'en';
  appsSeeded: boolean;
};

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  brand: 'XreyStudio',
  title: '',
  description: '',
  logoUrl: '',
  faviconUrl: '',
  accent: '#8474ff',
  background: '',
  defaultTheme: 'auto',
  customCss: '',
  blocks: { qr: true, traffic: true, expiry: true, apps: true, instructions: true, support: true },
  support: { telegram: '', website: '', email: '' },
  announcement: '',
  defaultLanguage: 'ru',
  appsSeeded: false,
};

type AppInput = {
  name: string;
  platform: string;
  iconUrl?: string | null;
  downloadUrl?: string | null;
  deepLinkTemplate?: string | null;
  instructions?: unknown;
  sortOrder?: number;
  enabled?: boolean;
  organizationId?: string | null;
};

const PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'android-tv', 'all'];

const DEFAULT_APPS: AppInput[] = [
  { name: 'Happ', platform: 'android', iconUrl: 'https://happ.app/favicon.ico', downloadUrl: 'https://happ.app/', deepLinkTemplate: 'happ://add/{subscription_url}', sortOrder: 10, instructions: { ru: 'Откройте Happ → «Добавить подписку» → вставьте ссылку.', en: 'Open Happ → Add subscription → paste the link.' } },
  { name: 'v2rayNG', platform: 'android', downloadUrl: 'https://github.com/2dust/v2rayNG/releases', deepLinkTemplate: 'v2rayng://add/{subscription_url}', sortOrder: 20, instructions: { ru: 'В v2rayNG: «+» → Импорт из буфера или ссылки.', en: 'In v2rayNG: “+” → Import from clipboard or link.' } },
  { name: 'Streisand', platform: 'android', downloadUrl: 'https://github.com/StreisandEffect/streisand', deepLinkTemplate: 'streisand://import/{subscription_url}', sortOrder: 30 },
  { name: 'Hiddify', platform: 'android', downloadUrl: 'https://github.com/hiddify/hiddify-app/releases', deepLinkTemplate: 'hiddify://import/{subscription_url}', sortOrder: 40 },
  { name: 'Clash Meta', platform: 'android', downloadUrl: 'https://github.com/MetaCubeX/Clash.Meta/releases', deepLinkTemplate: 'clash://install-config?url={subscription_url}', sortOrder: 50 },
  { name: 'FlClash', platform: 'windows', downloadUrl: 'https://github.com/chen08209/FlClash/releases', deepLinkTemplate: 'clash://install-config?url={subscription_url}', sortOrder: 60 },
  { name: 'Clash Verge', platform: 'windows', downloadUrl: 'https://github.com/clash-verge-rev/clash-verge-rev/releases', sortOrder: 70 },
  { name: 'sing-box', platform: 'android', downloadUrl: 'https://sing-box.sagernet.org/', deepLinkTemplate: 'sing-box://install-config?url={subscription_url}', sortOrder: 80 },
  { name: 'NekoBox', platform: 'android', downloadUrl: 'https://github.com/MatsuriDayo/NekoBoxForAndroid/releases', deepLinkTemplate: 'nekobox://install-config?url={subscription_url}', sortOrder: 90 },
  { name: 'V2Box', platform: 'ios', downloadUrl: 'https://apps.apple.com/app/v2box/id6476186705', sortOrder: 100 },
  { name: 'Shadowrocket', platform: 'ios', downloadUrl: 'https://apps.apple.com/app/shadowrocket/id932747118', sortOrder: 110 },
];

@Injectable()
export class SubscriptionPageService {
  constructor(private readonly prisma: PrismaService) {}

  private async config(): Promise<PageSettings> {
    const row = await this.prisma.subscriptionPageSettings.findUnique({ where: { id: 'default' } });
    const stored = (row?.settings || {}) as Partial<PageSettings>;
    return {
      ...DEFAULT_PAGE_SETTINGS,
      ...stored,
      blocks: { ...DEFAULT_PAGE_SETTINGS.blocks, ...(stored.blocks || {}) },
      support: { ...DEFAULT_PAGE_SETTINGS.support, ...(stored.support || {}) },
    };
  }

  private safeUrl(value: string, field: string) {
    if (!value) return '';
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException(`Invalid ${field}`); }
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new BadRequestException(`Invalid ${field}`);
    return value;
  }

  // Пользовательский CSS не должен выходить за <style> или загружать внешний код.
  private sanitizeCss(css: string) {
    if (!css) return '';
    if (css.length > 20_000) throw new BadRequestException('Custom CSS is too large');
    return css
      .replace(/<\/?[^>]*>/g, '')
      .replace(/@import[^;]*;?/gi, '')
      .replace(/url\s*\([^)]*\)/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/behavior\s*:/gi, '');
  }

  private validateSettings(input: Partial<PageSettings>) {
    for (const key of ['title', 'description', 'brand', 'announcement'] as const) {
      const value = input[key];
      if (value !== undefined && String(value).length > 2000) throw new BadRequestException(`${key} is too long`);
    }
    if (input.logoUrl) this.safeUrl(input.logoUrl, 'logoUrl');
    if (input.faviconUrl) this.safeUrl(input.faviconUrl, 'faviconUrl');
    if (input.support) {
      if (input.support.telegram) this.safeUrl(input.support.telegram, 'support.telegram');
      if (input.support.website) this.safeUrl(input.support.website, 'support.website');
      if (input.support.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.support.email)) {
        throw new BadRequestException('Invalid support.email');
      }
    }
    if (input.accent && !/^#[0-9a-fA-F]{6}$/.test(input.accent)) throw new BadRequestException('Invalid accent color');
    if (input.background && !/^#[0-9a-fA-F]{6}$/.test(input.background)) throw new BadRequestException('Invalid background color');
    if (input.defaultTheme && !['auto', 'dark', 'light'].includes(input.defaultTheme)) throw new BadRequestException('Invalid theme');
    if (input.defaultLanguage && !['ru', 'en'].includes(input.defaultLanguage)) throw new BadRequestException('Invalid language');
    if (input.customCss !== undefined) input.customCss = this.sanitizeCss(input.customCss);
  }

  async getSettings() { return this.config(); }

  async updateSettings(patch: Partial<PageSettings>) {
    this.validateSettings(patch);
    const next = { ...(await this.config()), ...patch };
    await this.prisma.subscriptionPageSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', settings: next as any },
      update: { settings: next as any },
    });
    return next;
  }

  private validateApp(data: AppInput) {
    if (!data.name || data.name.length > 120) throw new BadRequestException('Invalid app name');
    if (!PLATFORMS.includes(data.platform)) throw new BadRequestException('Invalid platform');
    if (data.iconUrl) this.safeUrl(data.iconUrl, 'iconUrl');
    if (data.downloadUrl) this.safeUrl(data.downloadUrl, 'downloadUrl');
    if (data.deepLinkTemplate) {
      if (data.deepLinkTemplate.length > 1024) throw new BadRequestException('Deep link is too long');
      if (!data.deepLinkTemplate.includes('{subscription_url}')) throw new BadRequestException('Deep link must contain {subscription_url}');
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(data.deepLinkTemplate)) throw new BadRequestException('Invalid deep link scheme');
    }
    if (data.instructions !== undefined &&
        (!data.instructions || typeof data.instructions !== 'object' || Array.isArray(data.instructions))) {
      throw new BadRequestException('Instructions must be an object');
    }
  }

  async listApps(actor?: AuthUser) {
    const where: Prisma.VpnAppWhereInput = actor && actor.role !== Role.ADMIN
      ? { OR: [{ organizationId: null }, { organizationId: actor.organizationId || '__none__' }] }
      : {};
    const existing = await this.prisma.vpnApp.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const config = await this.config();
    // Seed only from an authenticated admin request: a public page view must not write.
    if (!existing.length && !config.appsSeeded && actor?.role === Role.ADMIN) {
      const seeded = [...existing];
      for (const app of DEFAULT_APPS) {
        seeded.push(await this.prisma.vpnApp.create({ data: { ...app, instructions: (app.instructions || null) as any } }));
      }
      await this.updateSettings({ appsSeeded: true });
      return seeded;
    }
    return existing;
  }

  async createApp(data: AppInput, actor: AuthUser) {
    if (actor.role !== Role.ADMIN) throw new BadRequestException('Admin role required');
    this.validateApp(data);
    return this.prisma.vpnApp.create({
      data: {
        ...data,
        iconUrl: data.iconUrl || null,
        downloadUrl: data.downloadUrl || null,
        deepLinkTemplate: data.deepLinkTemplate || null,
        instructions: (data.instructions || null) as any,
        organizationId: data.organizationId || null,
      },
    });
  }

  async updateApp(id: string, data: Partial<AppInput>, actor: AuthUser) {
    if (actor.role !== Role.ADMIN) throw new BadRequestException('Admin role required');
    this.validateApp({ name: data.name || 'x', platform: data.platform || 'all', ...data });
    const payload: Prisma.VpnAppUpdateInput = { ...data, instructions: (data.instructions || null) as any };
    return this.prisma.vpnApp.update({ where: { id }, data: payload });
  }

  async removeApp(id: string, actor: AuthUser) {
    if (actor.role !== Role.ADMIN) throw new BadRequestException('Admin role required');
    await this.prisma.vpnApp.delete({ where: { id } });
    return { removed: true };
  }

  buildDeepLink(template: string | null | undefined, subscriptionUrl: string) {
    if (!template) return null;
    return template.replaceAll('{subscription_url}', encodeURIComponent(subscriptionUrl));
  }

  async publicPayload(templateSettings?: Record<string, unknown> | null) {
    const global = await this.config();
    const merged: PageSettings = {
      ...global,
      ...(templateSettings || {}),
      blocks: { ...global.blocks, ...((templateSettings?.blocks as Record<string, boolean>) || {}) },
      support: { ...global.support, ...((templateSettings?.support as Record<string, string>) || {}) },
    };
    // Template overrides bypass updateSettings(), so sanitize them again here:
    // raw CSS or javascript: links from a template must not reach the public page.
    try {
      merged.customCss = this.sanitizeCss(String(merged.customCss || ''));
    } catch {
      merged.customCss = '';
    }
    for (const key of ['logoUrl', 'faviconUrl'] as const) {
      try {
        merged[key] = merged[key] ? this.safeUrl(merged[key], key) : '';
      } catch {
        merged[key] = '';
      }
    }
    for (const key of ['telegram', 'website'] as const) {
      try {
        merged.support[key] = merged.support[key] ? this.safeUrl(merged.support[key], `support.${key}`) : '';
      } catch {
        merged.support[key] = '';
      }
    }
    if (!['auto', 'dark', 'light'].includes(merged.defaultTheme)) merged.defaultTheme = 'auto';
    if (merged.accent && !/^#[0-9a-fA-F]{6}$/.test(merged.accent)) merged.accent = DEFAULT_PAGE_SETTINGS.accent;
    if (merged.background && !/^#[0-9a-fA-F]{6}$/.test(merged.background)) merged.background = '';
    const apps = (await this.listApps())
      .filter((app) => app.enabled)
      .map((app) => ({
        id: app.id,
        name: app.name,
        platform: app.platform,
        iconUrl: app.iconUrl || null,
        downloadUrl: app.downloadUrl || null,
        deepLink: null,
        deepLinkTemplate: app.deepLinkTemplate || null,
        instructions: app.instructions || null,
        sortOrder: app.sortOrder,
      }));
    return { settings: merged, apps };
  }
}
