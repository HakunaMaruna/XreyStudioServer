// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BALANCER_STRATEGIES, buildBalancers, BuiltBalancers } from './balancer-builder';
import { BalancerMemberDto, CreateBalancerDto, UpdateBalancerDto } from './dto/balancer.dto';

const MATCHERS = ['domain', 'ip', 'port', 'network', 'inboundTag', 'protocol', 'source', 'user'];

@Injectable()
export class BalancersService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantWhere(actor: AuthUser): Prisma.BalancerWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || '__none__' };
  }

  private async findOwned(id: string, actor: AuthUser) {
    const row = await this.prisma.balancer.findFirst({ where: { id, ...this.tenantWhere(actor) }, include: { members: true } });
    if (!row) throw new NotFoundException('Balancer not found');
    return row;
  }

  private assertOrganization(dto: { organizationId?: string | null }, actor: AuthUser) {
    if (actor.role === Role.ADMIN) return;
    if (!actor.organizationId) throw new ForbiddenException('Organization is required to manage balancers');
    if (dto.organizationId && dto.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a balancer to another organization');
    }
  }

  private memberConfig(dto: BalancerMemberDto) {
    const settings: Record<string, unknown> = {};
    const streamSettings: Record<string, unknown> = {};
    if (dto.protocol !== 'freedom') {
      if (!dto.address) throw new BadRequestException('Member address is required');
      if (!dto.port) throw new BadRequestException('Member port is required');
      settings.address = dto.address;
      settings.port = dto.port;
    }
    switch (dto.protocol) {
      case 'vless':
        settings.clients = [{ id: dto.uuid || '', email: `${dto.uuid || 'member'}@balancer.local` }];
        settings.decryption = 'none';
        break;
      case 'vmess':
        settings.clients = [{ id: dto.uuid || '', alterId: 0 }];
        break;
      case 'trojan':
        settings.clients = [{ password: dto.password || '' }];
        break;
      case 'shadowsocks':
        settings.clients = [{ method: dto.method || 'aes-256-gcm', password: dto.password || '' }];
        break;
      case 'socks':
      case 'http':
        if (dto.password) settings.accounts = [{ user: dto.uuid || 'balancer', pass: dto.password }];
        break;
      default:
        break;
    }
    if (dto.security && dto.security !== 'none') streamSettings.security = dto.security;
    if (dto.transport && !['tcp', 'raw'].includes(dto.transport)) {
      streamSettings.network = dto.transport;
      if (dto.path) streamSettings.wsSettings = { path: dto.path };
    }
    if (dto.sni) {
      streamSettings.tlsSettings = { serverName: dto.sni };
    }
    return { settings, ...(Object.keys(streamSettings).length ? { streamSettings } : {}) };
  }

  private validate(dto: {
    strategy?: string; probeUrl?: string; rule?: unknown; members?: BalancerMemberDto[];
    observatoryMode?: string; burstDestination?: string; burstIntervalSec?: number;
    burstSampling?: number; burstTimeoutSec?: number;
  }) {
    if (dto.strategy && !BALANCER_STRATEGIES.includes(dto.strategy as any)) {
      throw new BadRequestException('Unknown balancing strategy');
    }
    if (dto.probeUrl) {
      let url: URL;
      try { url = new URL(dto.probeUrl); } catch { throw new BadRequestException('Invalid probe URL'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Probe URL must use http or https');
    }
    if (dto.rule !== undefined) {
      if (!dto.rule || typeof dto.rule !== 'object' || Array.isArray(dto.rule)) {
        throw new BadRequestException('Rule must be an object');
      }
      const rule = dto.rule as Record<string, unknown>;
      if (!MATCHERS.some((key) => rule[key] !== undefined)) {
        throw new BadRequestException('Rule needs at least one matcher');
      }
    }
    if (dto.observatoryMode && !['observatory', 'burstObservatory'].includes(dto.observatoryMode)) {
      throw new BadRequestException('Unknown observatory mode');
    }
    if (dto.burstDestination) {
      let url: URL;
      try { url = new URL(dto.burstDestination); } catch { throw new BadRequestException('Invalid burst destination'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Burst destination must use http or https');
    }
    if (dto.burstIntervalSec !== undefined && (dto.burstIntervalSec < 10 || dto.burstIntervalSec > 3600)) {
      throw new BadRequestException('Burst interval must be between 10 and 3600 seconds');
    }
    if (dto.burstSampling !== undefined && (dto.burstSampling < 1 || dto.burstSampling > 50)) {
      throw new BadRequestException('Burst sampling must be between 1 and 50');
    }
    if (dto.burstTimeoutSec !== undefined && (dto.burstTimeoutSec < 1 || dto.burstTimeoutSec > 60)) {
      throw new BadRequestException('Burst timeout must be between 1 and 60 seconds');
    }
    if (dto.members !== undefined && dto.members.length < 1) {
      throw new BadRequestException('At least one member is required');
    }
    for (const member of dto.members || []) this.memberConfig(member);
  }

  list(actor: AuthUser) {
    return this.prisma.balancer.findMany({
      where: this.tenantWhere(actor),
      include: { members: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, actor: AuthUser) {
    const row = await this.findOwned(id, actor);
    return {
      ...row,
      members: row.members.map((member) => ({
        id: member.id,
        protocol: member.protocol,
        enabled: member.enabled,
        config: JSON.parse(decryptSecret(member.config)) as Record<string, unknown>,
      })),
    };
  }

  /** Ready-to-use presets for the balancer form; values stay editable. */
  recipes() {
    return [
      {
        id: 'round-robin',
        name: 'Round Robin — two exits',
        description: 'Delivers connections evenly between two outbound nodes. No probing needed.',
        payload: {
          name: 'Round Robin test', strategy: 'roundRobin', enabled: true, fallbackTag: 'direct',
          observatoryMode: 'observatory', probeUrl: 'https://www.google.com/generate_204', probeIntervalSec: 30,
          rule: { type: 'field', domain: ['geosite:google'] },
          members: [
            { protocol: 'vless', address: 'exit-1.example.com', port: 443, uuid: '', security: 'reality', sni: 'exit-1.example.com', enabled: true },
            { protocol: 'vless', address: 'exit-2.example.com', port: 443, uuid: '', security: 'reality', sni: 'exit-2.example.com', enabled: true },
          ],
        },
      },
      {
        id: 'failover',
        name: 'Failover — primary + backup',
        description: 'Uses the first healthy outbound; switches to backup when probing fails.',
        payload: {
          name: 'Failover test', strategy: 'leastPing', enabled: true, fallbackTag: 'direct',
          observatoryMode: 'observatory', probeUrl: 'https://www.google.com/generate_204', probeIntervalSec: 30,
          rule: { type: 'field', network: 'tcp,udp' },
          members: [
            { protocol: 'vless', address: 'primary.example.com', port: 443, uuid: '', security: 'reality', sni: 'primary.example.com', enabled: true },
            { protocol: 'vless', address: 'backup.example.com', port: 443, uuid: '', security: 'reality', sni: 'backup.example.com', enabled: true },
          ],
        },
      },
      {
        id: 'least-load',
        name: 'Least Load — burst observatory',
        description: 'Chooses the least loaded outbound using short burst measurements.',
        payload: {
          name: 'Least Load test', strategy: 'leastLoad', enabled: true, fallbackTag: 'direct',
          observatoryMode: 'burstObservatory', burstDestination: 'https://www.cloudflare.com/cdn-cgi/trace',
          burstIntervalSec: 30, burstSampling: 3, burstTimeoutSec: 3,
          rule: { type: 'field', domain: ['geosite:category-ads-all'] },
          members: [
            { protocol: 'vless', address: 'node-a.example.com', port: 443, uuid: '', enabled: true },
            { protocol: 'vless', address: 'node-b.example.com', port: 443, uuid: '', enabled: true },
          ],
        },
      },
      {
        id: 'random',
        name: 'Random — simple test',
        description: 'Simplest preset: picks a random outbound, no observatory required.',
        payload: {
          name: 'Random test', strategy: 'random', enabled: true, fallbackTag: 'direct',
          observatoryMode: 'observatory', probeUrl: 'https://www.google.com/generate_204', probeIntervalSec: 30,
          rule: { type: 'field', ip: ['geoip:ru'] },
          members: [
            { protocol: 'freedom', enabled: true },
            { protocol: 'vless', address: 'exit.example.com', port: 443, uuid: '', security: 'reality', sni: 'exit.example.com', enabled: true },
          ],
        },
      },
    ];
  }

  async create(dto: CreateBalancerDto, actor: AuthUser) {
    this.assertOrganization(dto, actor);
    this.validate(dto);
    return this.prisma.balancer.create({
      data: {
        name: dto.name,
        strategy: dto.strategy || 'roundRobin',
        enabled: dto.enabled ?? false,
        fallbackTag: dto.fallbackTag || 'direct',
        probeUrl: dto.probeUrl || 'https://www.google.com/generate_204',
        probeIntervalSec: dto.probeIntervalSec || 30,
        observatoryMode: dto.observatoryMode || 'observatory',
        burstDestination: dto.burstDestination || 'https://connectivitycheck.gstatic.com/generate_204',
        burstIntervalSec: dto.burstIntervalSec || 60,
        burstSampling: dto.burstSampling || 10,
        burstTimeoutSec: dto.burstTimeoutSec || 5,
        rule: (dto.rule || null) as any,
        organizationId: dto.organizationId ?? actor.organizationId ?? null,
        members: {
          create: (dto.members || []).map((member) => ({
            protocol: member.protocol,
            config: encryptSecret(JSON.stringify(this.memberConfig(member))),
            enabled: member.enabled ?? true,
          })),
        },
      },
      include: { members: true },
    });
  }

  async update(id: string, dto: UpdateBalancerDto, actor: AuthUser) {
    const existing = await this.findOwned(id, actor);
    this.assertOrganization(dto, actor);
    this.validate(dto);

    const data: Prisma.BalancerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.strategy !== undefined) data.strategy = dto.strategy;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.fallbackTag !== undefined) data.fallbackTag = dto.fallbackTag;
    if (dto.probeUrl !== undefined) data.probeUrl = dto.probeUrl;
    if (dto.probeIntervalSec !== undefined) data.probeIntervalSec = dto.probeIntervalSec;
    if (dto.observatoryMode !== undefined) data.observatoryMode = dto.observatoryMode;
    if (dto.burstDestination !== undefined) data.burstDestination = dto.burstDestination;
    if (dto.burstIntervalSec !== undefined) data.burstIntervalSec = dto.burstIntervalSec;
    if (dto.burstSampling !== undefined) data.burstSampling = dto.burstSampling;
    if (dto.burstTimeoutSec !== undefined) data.burstTimeoutSec = dto.burstTimeoutSec;
    if (dto.rule !== undefined) data.rule = (dto.rule || null) as any;
    if (dto.organizationId !== undefined) data.organization = dto.organizationId
      ? { connect: { id: dto.organizationId } }
      : { disconnect: true };

    if (dto.members !== undefined) {
      // Полная замена списка участников: проще и предсказуемее для UI.
      await this.prisma.balancerMember.deleteMany({ where: { balancerId: id } });
      data.members = {
        create: dto.members.map((member) => ({
          protocol: member.protocol,
          config: encryptSecret(JSON.stringify(this.memberConfig(member))),
          enabled: member.enabled ?? true,
        })),
      };
    }

    return this.prisma.balancer.update({ where: { id: existing.id }, data, include: { members: true } });
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOwned(id, actor);
    await this.prisma.balancer.delete({ where: { id } });
    return { removed: true };
  }

  async buildForConfig(actor?: AuthUser): Promise<BuiltBalancers> {
    const rows = await this.prisma.balancer.findMany({
      where: { enabled: true, ...(actor && actor.role !== Role.ADMIN ? { organizationId: actor.organizationId || '__none__' } : {}) },
      include: { members: true },
    });
    const active = await this.prisma.nodeQuarantine.findMany({
      where: { until: { gt: new Date() } },
      select: { address: true },
    });
    return buildBalancers(rows, new Set(active.map((item) => item.address)));
  }

  async preview(id: string, actor: AuthUser) {
    const row = await this.findOwned(id, actor);
    const active = await this.prisma.nodeQuarantine.findMany({
      where: { until: { gt: new Date() } },
      select: { address: true },
    });
    return buildBalancers([{ ...row, enabled: true }], new Set(active.map((item) => item.address)));
  }
}

