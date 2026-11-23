import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SquadsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.squad.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async find(id: string) {
    const found = await this.prisma.squad.findUnique({
      where: { id },
      include: { users: { select: { id: true, email: true, status: true, trafficUsed: true, trafficLimit: true } } },
    });
    if (!found) throw new NotFoundException('Squad not found');
    return found;
  }

  create(data: { name: string; description?: string; trafficLimit?: number; expiresAt?: string; enabled?: boolean }) {
    return this.prisma.squad.create({
      data: {
        name: data.name,
        description: data.description,
        trafficLimit: BigInt(data.trafficLimit || 0),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        enabled: data.enabled ?? true,
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string; trafficLimit?: number; expiresAt?: string; enabled?: boolean }) {
    const found = await this.prisma.squad.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Squad not found');
    return this.prisma.squad.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.trafficLimit !== undefined ? { trafficLimit: BigInt(data.trafficLimit) } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.squad.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Squad not found');
    await this.prisma.squad.delete({ where: { id } });
    return { success: true };
  }

  async setMembers(id: string, userIds: string[]) {
    const found = await this.prisma.squad.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Squad not found');
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { squadId: id }, data: { squadId: null } }),
      this.prisma.user.updateMany({ where: { id: { in: userIds } }, data: { squadId: id } }),
    ]);
    return this.find(id);
  }
}
