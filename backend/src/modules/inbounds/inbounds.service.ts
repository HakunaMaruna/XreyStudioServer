// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BulkInboundUsersDto, CreateInboundDto, UpdateInboundDto } from './dto/inbound.dto';

@Injectable()
export class InboundsService {
  constructor(private prisma: PrismaService) {}

  // Подключения видны только своей организации; ADMIN видит все.
  private tenantWhere(user?: AuthUser): Prisma.InboundWhereInput {
    if (!user || user.role === Role.ADMIN) return {};
    const org = user.organizationId || null;
    return { OR: [{ node: { organizationId: org } }, { user: { organizationId: org } }] };
  }

  private async assertOwner(
    dto: {
      nodeId?: string;
      userId?: string;
      clients?: Array<{ userId: string }>;
      fallbacks?: Array<{ childId: string }>;
    },
    user?: AuthUser,
  ) {
    if (!user || user.role === Role.ADMIN) return;
    const org = user.organizationId || null;
    // Клиенты и fallback-подключения тоже должны принадлежать организации оператора.
    const clientIds = [...new Set((dto.clients || []).map((c) => c.userId).filter(Boolean))];
    if (clientIds.length) {
      const count = await this.prisma.user.count({ where: { id: { in: clientIds }, organizationId: org } });
      if (count !== clientIds.length) throw new ForbiddenException('Client belongs to another organization');
    }
    const childIds = [...new Set((dto.fallbacks || []).map((f) => f.childId).filter(Boolean))];
    if (childIds.length) {
      const count = await this.prisma.inbound.count({ where: { id: { in: childIds }, ...this.tenantWhere(user) } });
      if (count !== childIds.length) throw new ForbiddenException('Fallback inbound belongs to another organization');
    }
    if (dto.nodeId) {
      const node = await this.prisma.node.findUnique({ where: { id: dto.nodeId } });
      if (!node || node.organizationId !== org) throw new ForbiddenException('Node belongs to another organization');
    }
    if (dto.userId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!owner || owner.organizationId !== org) throw new ForbiddenException('User belongs to another organization');
    }
  }

  findAll(nodeId?: string, user?: AuthUser) {
    return this.prisma.inbound.findMany({
      where: { ...this.tenantWhere(user), ...(nodeId ? { nodeId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        node: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
        fallbacks: { include: { child: { select: { id: true, tag: true, protocol: true, port: true } } } },
        clients: { include: { user: { select: { id: true, email: true } } } },
      },
    });
  }

  async findOne(id: string, user?: AuthUser) {
    const found = await this.prisma.inbound.findFirst({
      where: { id, ...this.tenantWhere(user) },
      include: {
        node: true,
        user: { select: { id: true, email: true } },
        fallbacks: { include: { child: { select: { id: true, tag: true, protocol: true, port: true } } } },
        clients: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!found) throw new NotFoundException('Inbound not found');
    return found;
  }

  async create(dto: CreateInboundDto, user?: AuthUser) {
    await this.assertOwner(dto, user);
    return this.prisma.inbound.create({
      data: {
        tag: dto.tag,
        nodeId: dto.nodeId || null,
        userId: dto.userId || null,
        protocol: dto.protocol,
        transport: dto.transport || 'tcp',
        security: dto.security || 'none',
        port: dto.port,
        listen: dto.listen || '0.0.0.0',
        flow: dto.flow || null,
        path: dto.path || null,
        sni: dto.sni || null,
        serviceName: dto.serviceName || null,
        trafficLimit: BigInt(dto.trafficLimit || 0),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        resetSchedule: dto.resetSchedule || 'never',
        resetDay: dto.resetDay ?? null,
        settings: dto.settings as any,
        enabled: dto.enabled ?? true,
        ...(dto.fallbacks?.length
          ? { fallbacks: { create: dto.fallbacks.map((f) => ({ childId: f.childId, path: f.path, alpn: f.alpn, dest: f.dest, xver: f.xver || 0 })) } }
          : {}),
        ...(dto.clients?.length
          ? { clients: { create: dto.clients.map((c) => ({ userId: c.userId, trafficLimit: BigInt(c.trafficLimit || 0), expiresAt: c.expiresAt ? new Date(c.expiresAt) : null, enabled: c.enabled ?? true, comment: c.comment, sortIndex: c.sortIndex || 0 })) } }
          : {}),
      },
    });
  }

  async update(id: string, dto: UpdateInboundDto, user?: AuthUser) {
    await this.findOne(id, user);
    await this.assertOwner(dto, user);
    const ops: any[] = [];
    if (dto.clients !== undefined) {
      ops.push(this.prisma.inboundClient.deleteMany({ where: { inboundId: id } }));
      if (dto.clients.length) {
        ops.push(this.prisma.inboundClient.createMany({
          data: dto.clients.map((c) => ({
            inboundId: id,
            userId: c.userId,
            trafficLimit: BigInt(c.trafficLimit || 0),
            expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
            enabled: c.enabled ?? true,
            comment: c.comment,
            sortIndex: c.sortIndex || 0,
          })),
          skipDuplicates: true,
        }));
      }
    }
    if (dto.fallbacks !== undefined) {
      ops.push(this.prisma.inboundFallback.deleteMany({ where: { masterId: id } }));
      if (dto.fallbacks.length) {
        ops.push(this.prisma.inboundFallback.createMany({
          data: dto.fallbacks.map((f) => ({
            masterId: id, childId: f.childId, path: f.path || '',
            alpn: f.alpn || '', dest: f.dest || '', xver: f.xver || 0,
          })),
          skipDuplicates: true,
        }));
      }
    }
    ops.push(this.prisma.inbound.update({
      where: { id },
      data: {
        ...(dto.tag !== undefined ? { tag: dto.tag } : {}),
        ...(dto.nodeId !== undefined ? { nodeId: dto.nodeId || null } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId || null } : {}),
        ...(dto.protocol !== undefined ? { protocol: dto.protocol } : {}),
        ...(dto.transport !== undefined ? { transport: dto.transport } : {}),
        ...(dto.security !== undefined ? { security: dto.security } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.listen !== undefined ? { listen: dto.listen } : {}),
        ...(dto.flow !== undefined ? { flow: dto.flow || null } : {}),
        ...(dto.path !== undefined ? { path: dto.path || null } : {}),
        ...(dto.sni !== undefined ? { sni: dto.sni || null } : {}),
        ...(dto.serviceName !== undefined ? { serviceName: dto.serviceName || null } : {}),
        ...(dto.trafficLimit !== undefined ? { trafficLimit: BigInt(dto.trafficLimit) } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
        ...(dto.resetSchedule !== undefined ? { resetSchedule: dto.resetSchedule } : {}),
        ...(dto.resetDay !== undefined ? { resetDay: dto.resetDay } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings as any } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    }));
    await this.prisma.$transaction(ops);
    return this.findOne(id, user);
  }


  async bulkUsers(inboundId: string, dto: BulkInboundUsersDto, user?: AuthUser) {
    const inbound = await this.findOne(inboundId, user);
    if (dto.scope === 'selected' && (!dto.userIds?.length || dto.userIds.length > 5000)) {
      throw new BadRequestException('Provide between 1 and 5000 userIds for selected scope');
    }
    if (dto.scope === 'squad' && !dto.squadId) {
      throw new BadRequestException('squadId is required for squad scope');
    }
    const org = user?.role === Role.ADMIN ? null : user?.organizationId ?? null;
    const tenant = org ? { OR: [{ organizationId: org }, { organizationId: null }] } : {};
    if (dto.scope === 'squad') {
      const squad = await this.prisma.squad.findFirst({ where: { id: dto.squadId!, ...tenant }, select: { id: true } });
      if (!squad) throw new BadRequestException('Squad not found in this organization');
    }
    const where: Prisma.UserWhereInput = {
      ...tenant,
      ...(dto.scope === 'selected' ? { id: { in: dto.userIds! } } : {}),
      ...(dto.scope === 'squad' ? { squadId: dto.squadId! } : {}),
    };
    const found = await this.prisma.user.findMany({ where, select: { id: true } });
    if (dto.scope === 'selected' && found.length !== new Set(dto.userIds!).size) {
      throw new BadRequestException('Some users were not found in this organization');
    }
    const ids = found.map((row) => row.id);
    if (!ids.length) {
      return { inboundId, mode: dto.mode, scope: dto.scope, targetCount: 0, affected: 0, skipped: 0 };
    }
    if (dto.mode === 'add') {
      const result = await this.prisma.inboundClient.createMany({
        data: ids.map((userId) => ({ inboundId, userId })),
        skipDuplicates: true,
      });
      return { inboundId, mode: dto.mode, scope: dto.scope, targetCount: ids.length, affected: result.count, skipped: ids.length - result.count };
    }
    const result = await this.prisma.inboundClient.deleteMany({ where: { inboundId, userId: { in: ids } } });
    return { inboundId, mode: dto.mode, scope: dto.scope, targetCount: ids.length, affected: result.count, skipped: ids.length - result.count };
  }

  async remove(id: string, user?: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.inbound.delete({ where: { id } });
    return { success: true };
  }
}
