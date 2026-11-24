import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInboundDto, UpdateInboundDto } from './dto/inbound.dto';

@Injectable()
export class InboundsService {
  constructor(private prisma: PrismaService) {}

  // Подключения видны только своей организации; ADMIN видит все.
  private tenantWhere(user?: AuthUser): Prisma.InboundWhereInput {
    if (!user || user.role === Role.ADMIN) return {};
    const org = user.organizationId || null;
    return { OR: [{ node: { organizationId: org } }, { user: { organizationId: org } }] };
  }

  private async assertOwner(dto: { nodeId?: string; userId?: string }, user?: AuthUser) {
    if (!user || user.role === Role.ADMIN) return;
    const org = user.organizationId || null;
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
    return this.prisma.inbound.update({
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
    });
  }

  async remove(id: string, user?: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.inbound.delete({ where: { id } });
    return { success: true };
  }
}
