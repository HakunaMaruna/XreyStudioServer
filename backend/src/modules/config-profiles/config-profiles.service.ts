import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConfigProfilesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.configProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  find(id: string) {
    return this.prisma.configProfile.findUnique({ where: { id } });
  }

  create(data: { name: string; description?: string; payload: unknown; enabled?: boolean }) {
    return this.prisma.configProfile.create({
      data: {
        name: data.name,
        description: data.description,
        payload: data.payload as any,
        enabled: data.enabled ?? true,
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string; payload?: unknown; enabled?: boolean }) {
    const found = await this.find(id);
    if (!found) throw new NotFoundException('Config profile not found');
    return this.prisma.configProfile.update({
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
    const found = await this.find(id);
    if (!found) throw new NotFoundException('Config profile not found');
    await this.prisma.configProfile.delete({ where: { id } });
    return { success: true };
  }
}
