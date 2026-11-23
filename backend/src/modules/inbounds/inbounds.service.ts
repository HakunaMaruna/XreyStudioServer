import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInboundDto, UpdateInboundDto } from './dto/inbound.dto';

@Injectable()
export class InboundsService {
  constructor(private prisma: PrismaService) {}

  findAll(nodeId?: string) {
    return this.prisma.inbound.findMany({
      where: nodeId ? { nodeId } : {},
      orderBy: { createdAt: 'desc' },
      include: { node: { select: { id: true, name: true } }, user: { select: { id: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.inbound.findUnique({
      where: { id },
      include: { node: true, user: { select: { id: true, email: true } } },
    });
    if (!found) throw new NotFoundException('Inbound not found');
    return found;
  }

  create(dto: CreateInboundDto) {
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
      },
    });
  }

  async update(id: string, dto: UpdateInboundDto) {
    await this.findOne(id);
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

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inbound.delete({ where: { id } });
    return { success: true };
  }
}
