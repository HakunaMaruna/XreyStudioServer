import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoutingService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.routingProfile.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(data: { name: string; description?: string; payload: unknown; enabled?: boolean }) {
    return this.prisma.routingProfile.create({
      data: {
        name: data.name,
        description: data.description,
        payload: data.payload as any,
        enabled: data.enabled ?? false,
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string; payload?: unknown; enabled?: boolean }) {
    const found = await this.prisma.routingProfile.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Routing profile not found');
    return this.prisma.routingProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.payload !== undefined ? { payload: data.payload as any } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.routingProfile.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Routing profile not found');
    await this.prisma.routingProfile.delete({ where: { id } });
    return { success: true };
  }
}
