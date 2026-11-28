// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReverseService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantWhere(actor: AuthUser): Prisma.ReverseTunnelWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || '__none__' };
  }

  private async findOwned(id: string, actor: AuthUser) {
    const row = await this.prisma.reverseTunnel.findFirst({ where: { id, ...this.tenantWhere(actor) } });
    if (!row) throw new NotFoundException('Reverse tunnel not found');
    return row;
  }

  async get(id: string, actor: AuthUser) { return this.findOwned(id, actor); }

  list(actor: AuthUser) {
    return this.prisma.reverseTunnel.findMany({
      where: this.tenantWhere(actor),
      include: { node: { select: { id: true, name: true } }, portalInbound: { select: { id: true, tag: true, port: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: {
    name: string; nodeId: string; portalInboundId: string; publicPort: number;
    internalAddress?: string; internalPort: number; enabled?: boolean; organizationId?: string | null;
  }, actor: AuthUser) {
    const org = actor.organizationId || '__none__';
    const node = await this.prisma.node.findFirst({ where: { id: dto.nodeId, ...(actor.role === Role.ADMIN ? {} : { organizationId: org }) } });
    if (!node) throw new NotFoundException('Target node not found');
    const inbound = await this.prisma.inbound.findFirst({
      where: {
        id: dto.portalInboundId, enabled: true, protocol: 'vless',
        ...(actor.role === Role.ADMIN ? {} : { OR: [{ node: { organizationId: org } }, { user: { organizationId: org } }] }),
      },
    });
    if (!inbound) throw new BadRequestException('Portal inbound must be an enabled VLESS inbound');
    if (dto.publicPort < 1 || dto.publicPort > 65535) throw new BadRequestException('Invalid public port');
    if (dto.internalPort < 1 || dto.internalPort > 65535) throw new BadRequestException('Invalid internal port');
    if (dto.organizationId && actor.role !== Role.ADMIN && dto.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a tunnel to another organization');
    }
    const id = randomUUID();
    return this.prisma.reverseTunnel.create({
      data: {
        id,
        name: dto.name,
        enabled: dto.enabled ?? false,
        nodeId: node.id,
        portalInboundId: inbound.id,
        publicPort: dto.publicPort,
        internalAddress: dto.internalAddress || '127.0.0.1',
        internalPort: dto.internalPort,
        bridgeUuid: randomUUID(),
        reverseDomain: `rev-${id.slice(0, 8)}.xray.internal`,
        organizationId: dto.organizationId ?? actor.organizationId ?? null,
      },
    });
  }

  async update(id: string, dto: {
    name?: string; enabled?: boolean; publicPort?: number; internalAddress?: string; internalPort?: number;
  }, actor: AuthUser) {
    await this.findOwned(id, actor);
    if (dto.publicPort !== undefined && (dto.publicPort < 1 || dto.publicPort > 65535)) throw new BadRequestException('Invalid public port');
    if (dto.internalPort !== undefined && (dto.internalPort < 1 || dto.internalPort > 65535)) throw new BadRequestException('Invalid internal port');
    const data: Prisma.ReverseTunnelUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.publicPort !== undefined) data.publicPort = dto.publicPort;
    if (dto.internalAddress !== undefined) data.internalAddress = dto.internalAddress;
    if (dto.internalPort !== undefined) data.internalPort = dto.internalPort;
    return this.prisma.reverseTunnel.update({ where: { id }, data });
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOwned(id, actor);
    await this.prisma.reverseTunnel.delete({ where: { id } });
    return { removed: true };
  }
}
