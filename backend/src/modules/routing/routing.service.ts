// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ROUTING_RECIPES } from './routing-recipes';

type RoutingPayload = {
  routingRules?: Record<string, unknown>[];
  dnsServers?: string[];
  outbounds?: Record<string, unknown>[];
};

@Injectable()
export class RoutingService {
  constructor(private prisma: PrismaService) {}

  private tenantWhere(user: AuthUser): Prisma.RoutingProfileWhereInput {
    if (user.role === Role.ADMIN) return {};
    return { organizationId: user.organizationId || '__none__' };
  }

  private assertOrganization(dto: { organizationId?: string | null }, user: AuthUser) {
    if (user.role === Role.ADMIN) return;
    if (!user.organizationId) throw new ForbiddenException('Organization is required to manage routing');
    if (dto.organizationId !== undefined && dto.organizationId !== user.organizationId) {
      throw new ForbiddenException('Cannot assign a routing profile to another organization');
    }
  }

  private async assertInbound(dto: { inboundId?: string | null }, user: AuthUser) {
    if (!dto.inboundId) return;
    const inbound = await this.prisma.inbound.findUnique({
      where: { id: dto.inboundId },
      include: { node: { select: { organizationId: true } }, user: { select: { organizationId: true } } },
    });
    if (!inbound) throw new NotFoundException('Inbound not found');
    if (user.role !== Role.ADMIN && inbound.node?.organizationId !== user.organizationId
        && inbound.user?.organizationId !== user.organizationId) {
      throw new ForbiddenException('Inbound belongs to another organization');
    }
  }

  list(user: AuthUser) {
    return this.prisma.routingProfile.findMany({
      where: this.tenantWhere(user),
      orderBy: { createdAt: 'desc' },
      include: { inbound: { select: { id: true, tag: true, port: true } } },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const found = await this.prisma.routingProfile.findFirst({
      where: { id, ...this.tenantWhere(user) },
      include: { inbound: { select: { id: true, tag: true, port: true } } },
    });
    if (!found) throw new NotFoundException('Routing profile not found');
    return found;
  }

  recipes() {
    return ROUTING_RECIPES;
  }

  // Профиль должен безопасно сливаться с генерируемым конфигом Xray.
  validate(payload: unknown) {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, errors: ['payload must be an object'] };
    }
    const p = payload as RoutingPayload;
    const reservedTags = new Set(['direct', 'blocked', 'api']);
    const tags = new Set<string>(reservedTags);

    if (p.dnsServers !== undefined) {
      if (!Array.isArray(p.dnsServers) || p.dnsServers.length > 16) {
        errors.push('dnsServers must be an array of at most 16 strings');
      } else {
        p.dnsServers.forEach((server, index) => {
          if (typeof server !== 'string' || !server.trim()) errors.push(`dnsServers[${index}] must be a non-empty string`);
        });
      }
    }

    if (p.outbounds !== undefined) {
      if (!Array.isArray(p.outbounds) || p.outbounds.length > 16) {
        errors.push('outbounds must be an array of at most 16 entries');
      } else {
        p.outbounds.forEach((outbound, index) => {
          if (!outbound || typeof outbound !== 'object') {
            errors.push(`outbounds[${index}] must be an object`);
            return;
          }
          const tag = outbound.tag;
          if (typeof tag !== 'string' || !tag.trim()) errors.push(`outbounds[${index}].tag is required`);
          else if (reservedTags.has(tag)) errors.push(`outbound tag ${tag} is reserved`);
          else if (tags.has(tag)) errors.push(`duplicate outbound tag: ${tag}`);
          else tags.add(tag);
          if (!outbound.protocol || typeof outbound.protocol !== 'string') {
            errors.push(`outbounds[${index}].protocol is required`);
          }
        });
      }
    }

    if (p.routingRules === undefined) {
      // Профиль может задавать только DNS/аутбанды — это допустимо.
      return { valid: errors.length === 0, errors };
    }
    if (!Array.isArray(p.routingRules) || p.routingRules.length > 64) {
      errors.push('routingRules must be an array of at most 64 rules');
      return { valid: false, errors };
    }
    p.routingRules.forEach((rule, index) => {
      if (!rule || typeof rule !== 'object') {
        errors.push(`routingRules[${index}] must be an object`);
        return;
      }
      const tag = rule.outboundTag;
      if (typeof tag !== 'string' || !tags.has(tag)) errors.push(`routingRules[${index}] has unknown outboundTag: ${String(tag)}`);
      const matchers = ['domain', 'ip', 'protocol', 'port', 'inboundTag', 'source', 'network', 'user'];
      if (!matchers.some((key) => rule[key] !== undefined)) {
        errors.push(`routingRules[${index}] needs at least one matcher`);
      }
      for (const key of ['domain', 'ip', 'protocol', 'inboundTag', 'source']) {
        const value = rule[key];
        if (value !== undefined && typeof value !== 'string' && !Array.isArray(value)) {
          errors.push(`routingRules[${index}].${key} must be a string or an array`);
        }
      }
    });
    return { valid: errors.length === 0, errors };
  }

  private assertValid(payload: unknown) {
    const check = this.validate(payload);
    if (!check.valid) throw new ForbiddenException(`Invalid routing profile: ${check.errors.join(', ')}`);
  }

  async create(dto: {
    name: string;
    description?: string;
    payload: unknown;
    recipe?: string;
    enabled?: boolean;
    organizationId?: string | null;
    inboundId?: string | null;
  }, user: AuthUser) {
    this.assertOrganization(dto, user);
    await this.assertInbound(dto, user);
    this.assertValid(dto.payload);
    return this.prisma.routingProfile.create({
      data: {
        name: dto.name,
        description: dto.description,
        payload: dto.payload as any,
        recipe: dto.recipe,
        enabled: dto.enabled ?? false,
        organizationId: dto.organizationId ?? user.organizationId ?? null,
        inboundId: dto.inboundId || null,
      },
    });
  }

  async update(id: string, dto: {
    name?: string;
    description?: string;
    payload?: unknown;
    recipe?: string;
    enabled?: boolean;
    organizationId?: string | null;
    inboundId?: string | null;
  }, user: AuthUser) {
    await this.findOne(id, user);
    this.assertOrganization(dto, user);
    await this.assertInbound(dto, user);
    if (dto.payload !== undefined) this.assertValid(dto.payload);
    return this.prisma.routingProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.payload !== undefined ? { payload: dto.payload as any } : {}),
        ...(dto.recipe !== undefined ? { recipe: dto.recipe } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
        ...(dto.inboundId !== undefined ? { inboundId: dto.inboundId || null } : {}),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.routingProfile.delete({ where: { id } });
    return { success: true };
  }
}
