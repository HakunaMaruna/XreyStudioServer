import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isIP } from 'net';
import { promises as dns } from 'dns';
import { PrismaService } from '../../prisma/prisma.service';

const SHARE_SCHEMES = new Set([
  'vless', 'vmess', 'trojan', 'ss', 'ssr', 'hysteria', 'hysteria2', 'hy2',
  'tuic', 'wireguard', 'wg', 'socks', 'socks5',
]);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINKS = 1000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_CAPACITY = 256;

type CacheEntry = { links: string[]; at: number };

function privateIp(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  if (ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;
  if (isIP(ip) !== 4) return /^(fe80|fc|fd)/i.test(ip);
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

@Injectable()
export class ExternalLinksService {
  private readonly logger = new Logger(ExternalLinksService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.userExternalLink.findMany({
      where: { userId },
      orderBy: [{ sortIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: { kind?: string; value?: string; remark?: string; enabled?: boolean }) {
    const kind = dto.kind === 'subscription' ? 'subscription' : 'link';
    const value = String(dto.value || '').trim();
    if (!value || value.length > 8192) throw new BadRequestException('Invalid external link value');
    if (kind === 'subscription') {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('External subscription must be an http(s) URL');
      await this.assertPublicUrl(url);
    } else {
      const scheme = value.split('://')[0]?.toLowerCase();
      if (!scheme || !SHARE_SCHEMES.has(scheme)) throw new BadRequestException('Unsupported share link scheme');
    }
    const last = await this.prisma.userExternalLink.findFirst({
      where: { userId }, orderBy: { sortIndex: 'desc' }, select: { sortIndex: true },
    });
    return this.prisma.userExternalLink.create({
      data: {
        userId,
        kind,
        value,
        remark: dto.remark?.trim() || null,
        enabled: dto.enabled !== false,
        sortIndex: (last?.sortIndex ?? -1) + 1,
      },
    });
  }

  async remove(userId: string, linkId: string) {
    const row = await this.prisma.userExternalLink.findFirst({ where: { id: linkId, userId } });
    if (!row) throw new NotFoundException('External link not found');
    await this.prisma.userExternalLink.delete({ where: { id: linkId } });
    return { success: true };
  }

  /** All share links that must be appended to this user's own subscription. */
  async resolve(userId: string): Promise<string[]> {
    const rows = await this.list(userId);
    const out: string[] = [];
    for (const row of rows) {
      if (!row.enabled) continue;
      if (row.kind === 'link') {
        out.push(row.value);
        continue;
      }
      try {
        const links = await this.fetchSubscription(row.value);
        out.push(...links);
        await this.prisma.userExternalLink.update({
          where: { id: row.id },
          data: { lastFetchAt: new Date(), lastFetchError: null },
        });
      } catch (error: any) {
        const message = String(error?.message || 'fetch failed').slice(0, 500);
        this.logger.warn(`External subscription fetch failed: ${message}`);
        await this.prisma.userExternalLink.update({
          where: { id: row.id },
          data: { lastFetchAt: new Date(), lastFetchError: message },
        });
      }
    }
    return out.slice(0, MAX_LINKS);
  }

  private async assertPublicUrl(url: URL) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.toLowerCase() === 'metadata.google.internal' || privateIp(host)) {
      throw new BadRequestException('External subscription host is not allowed');
    }
    if (isIP(host) !== 0) return;
    let addresses: Array<{ address: string }>;
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw new BadRequestException('External subscription host could not be resolved');
    }
    if (!addresses.length || addresses.some((a) => privateIp(a.address))) {
      throw new BadRequestException('External subscription resolves to a private address');
    }
  }

  private cached(url: string): string[] | null {
    const entry = this.cache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      this.cache.delete(url);
      return null;
    }
    return entry.links;
  }

  private remember(url: string, links: string[]) {
    if (this.cache.size >= CACHE_CAPACITY) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(url, { links, at: Date.now() });
  }

  private async fetchSubscription(rawUrl: string): Promise<string[]> {
    const cached = this.cached(rawUrl);
    if (cached) return cached;
    let current = new URL(rawUrl);
    for (let hop = 0; hop < 4; hop += 1) {
      await this.assertPublicUrl(current);
      const response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'XreyStudio/1.0', Accept: 'text/plain, */*' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect without location');
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`Subscription responded ${response.status}`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) throw new Error('Subscription body is too large');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) throw new Error('Subscription body is too large');
      const links = this.decodeBody(Buffer.from(buffer).toString('utf8'));
      this.remember(rawUrl, links);
      return links;
    }
    throw new Error('Too many subscription redirects');
  }

  private decodeBody(body: string): string[] {
    let text = body.trim();
    if (!text) return [];
    if (!text.includes('://')) {
      const clean = text.replace(/\s+/g, '');
      try {
        const decoded = Buffer.from(clean, 'base64').toString('utf8');
        if (/^(vless|vmess|trojan|ss|hy2|hysteria2|tuic):\/\//i.test(decoded.trim())) text = decoded;
      } catch {}
    }
    const links = text.split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter((line) => SHARE_SCHEMES.has(line.split('://')[0]?.toLowerCase()));
    return links.slice(0, MAX_LINKS);
  }
}
