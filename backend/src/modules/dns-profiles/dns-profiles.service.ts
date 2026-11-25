import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { DNS_RECIPES } from './dns-recipes';

const GLOBAL_OPTIONS = [
  'queryStrategy', 'disableCache', 'serveStale', 'serveExpiredTTL',
  'disableFallback', 'disableFallbackIfMatch', 'enableParallelQuery',
  'useSystemHosts', 'tag',
];
const SERVER_KEYS = [
  'address', 'port', 'domains', 'expectedIPs', 'unexpectedIPs',
  'skipFallback', 'finalQuery', 'tag', 'clientIP', 'queryStrategy',
  'disableCache', 'timeoutMs',
];
const QUERY_STRATEGIES = ['UseIP', 'UseIPv4', 'UseIPv6', 'UseSystem'];

@Injectable()
export class DnsProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantWhere(actor: AuthUser): Prisma.DnsProfileWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || '__none__' };
  }

  private async findOwned(id: string, actor: AuthUser) {
    const row = await this.prisma.dnsProfile.findFirst({ where: { id, ...this.tenantWhere(actor) } });
    if (!row) throw new NotFoundException('DNS profile not found');
    return row;
  }

  private assertOrganization(dto: { organizationId?: string | null }, actor: AuthUser) {
    if (actor.role === Role.ADMIN) return;
    if (!actor.organizationId) throw new ForbiddenException('Organization is required to manage DNS profiles');
    if (dto.organizationId && dto.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a DNS profile to another organization');
    }
  }

  recipes() { return DNS_RECIPES; }

  validate(payload: { hosts?: unknown; servers?: unknown; options?: unknown }) {
    const errors: string[] = [];
    if (payload.hosts !== undefined) {
      if (!payload.hosts || typeof payload.hosts !== 'object' || Array.isArray(payload.hosts)) {
        errors.push('hosts must be an object');
      } else {
        for (const [domain, value] of Object.entries(payload.hosts as Record<string, unknown>)) {
          if (!domain || domain.length > 253) errors.push(`invalid host key: ${domain}`);
          if (typeof value !== 'string' && !(Array.isArray(value) && value.every((v) => typeof v === 'string'))) {
            errors.push(`hosts.${domain} must be a string or an array of strings`);
          }
        }
      }
    }
    if (!Array.isArray(payload.servers) || payload.servers.length === 0 || payload.servers.length > 32) {
      errors.push('servers must be an array of 1..32 entries');
    } else {
      payload.servers.forEach((server, index) => {
        if (typeof server === 'string') {
          if (!this.validAddress(server)) errors.push(`servers[${index}] has an invalid address`);
          return;
        }
        if (!server || typeof server !== 'object') {
          errors.push(`servers[${index}] must be a string or an object`);
          return;
        }
        const item = server as Record<string, unknown>;
        const address = String(item.address || '');
        if (!this.validAddress(address)) errors.push(`servers[${index}].address is invalid`);
        for (const [key, value] of Object.entries(item)) {
          if (!SERVER_KEYS.includes(key)) errors.push(`servers[${index}].${key} is not supported`);
          if (key === 'queryStrategy' && !QUERY_STRATEGIES.includes(String(value))) {
            errors.push(`servers[${index}].queryStrategy is invalid`);
          }
          if (['domains', 'expectedIPs', 'unexpectedIPs'].includes(key) &&
              !(Array.isArray(value) && value.every((entry) => typeof entry === 'string'))) {
            errors.push(`servers[${index}].${key} must be an array of strings`);
          }
        }
      });
    }
    if (payload.options !== undefined) {
      if (!payload.options || typeof payload.options !== 'object' || Array.isArray(payload.options)) {
        errors.push('options must be an object');
      } else {
        for (const [key, value] of Object.entries(payload.options as Record<string, unknown>)) {
          if (!GLOBAL_OPTIONS.includes(key)) errors.push(`options.${key} is not supported`);
          if (key === 'queryStrategy' && !QUERY_STRATEGIES.includes(String(value))) {
            errors.push('options.queryStrategy is invalid');
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private validAddress(value: string) {
    if (!value || value.length > 512) return false;
    if (value === 'localhost') return true;
    if (/^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/.test(value)) return true;
    if (/^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(value)) return true;
    if (/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(value)) return true;
    if (/^(https|tcp|tcp\+local|https\+local|quic\+local|h2c):\/\//.test(value)) return true;
    return false;
  }

  list(actor: AuthUser) {
    return this.prisma.dnsProfile.findMany({
      where: this.tenantWhere(actor),
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async get(id: string, actor: AuthUser) { return this.findOwned(id, actor); }

  async create(dto: {
    name: string; description?: string; enabled?: boolean; priority?: number;
    hosts?: unknown; servers: unknown; options?: unknown; recipe?: string; organizationId?: string | null;
  }, actor: AuthUser) {
    this.assertOrganization(dto, actor);
    const check = this.validate({ hosts: dto.hosts, servers: dto.servers, options: dto.options });
    if (!check.valid) throw new BadRequestException(`Invalid DNS profile: ${check.errors.join(', ')}`);
    return this.prisma.dnsProfile.create({
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? false,
        priority: dto.priority ?? 0,
        hosts: (dto.hosts || null) as any,
        servers: dto.servers as any,
        options: (dto.options || null) as any,
        recipe: dto.recipe,
        organizationId: dto.organizationId ?? actor.organizationId ?? null,
      },
    });
  }

  async update(id: string, dto: {
    name?: string; description?: string; enabled?: boolean; priority?: number;
    hosts?: unknown; servers?: unknown; options?: unknown; recipe?: string; organizationId?: string | null;
  }, actor: AuthUser) {
    await this.findOwned(id, actor);
    this.assertOrganization(dto, actor);
    if (dto.servers !== undefined || dto.hosts !== undefined || dto.options !== undefined) {
      const check = this.validate({ hosts: dto.hosts, servers: dto.servers, options: dto.options });
      if (!check.valid) throw new BadRequestException(`Invalid DNS profile: ${check.errors.join(', ')}`);
    }
    const data: Prisma.DnsProfileUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.recipe !== undefined) data.recipe = dto.recipe;
    if (dto.hosts !== undefined) data.hosts = (dto.hosts || null) as any;
    if (dto.servers !== undefined) data.servers = dto.servers as any;
    if (dto.options !== undefined) data.options = (dto.options || null) as any;
    if (dto.organizationId !== undefined) data.organization = dto.organizationId
      ? { connect: { id: dto.organizationId } }
      : { disconnect: true };
    return this.prisma.dnsProfile.update({ where: { id }, data });
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOwned(id, actor);
    await this.prisma.dnsProfile.delete({ where: { id } });
    return { removed: true };
  }

  // Строит итоговый DnsObject для генератора конфига.
  async buildForConfig() {
    const rows = await this.prisma.dnsProfile.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const dns: Record<string, unknown> = { servers: [] as unknown[], queryStrategy: 'UseIP' };
    for (const row of rows) {
      const payload = row as any;
      if (payload.hosts && typeof payload.hosts === 'object') {
        dns.hosts = { ...((dns.hosts as Record<string, unknown>) || {}), ...payload.hosts };
      }
      if (Array.isArray(payload.servers)) {
        const servers = dns.servers as unknown[];
        for (const server of payload.servers) {
          const key = typeof server === 'string' ? server : JSON.stringify(server);
          if (!servers.some((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)) === key)) {
            servers.push(server);
          }
        }
      }
      if (payload.options && typeof payload.options === 'object') {
        Object.assign(dns, payload.options);
      }
    }
    return dns;
  }
}
