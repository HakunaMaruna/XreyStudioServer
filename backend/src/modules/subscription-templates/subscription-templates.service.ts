import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionTemplatesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.subscriptionTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async find(id: string) {
    const found = await this.prisma.subscriptionTemplate.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Subscription template not found');
    return found;
  }

  create(data: { name: string; title: string; description?: string; accent?: string; instructions?: unknown; footer?: string; enabled?: boolean }) {
    return this.prisma.subscriptionTemplate.create({
      data: {
        name: data.name,
        title: data.title,
        description: data.description,
        accent: data.accent || '#8474ff',
        instructions: data.instructions as any,
        footer: data.footer,
        enabled: data.enabled ?? true,
      },
    });
  }

  async update(id: string, data: { name?: string; title?: string; description?: string; accent?: string; instructions?: unknown; footer?: string; enabled?: boolean }) {
    await this.find(id);
    return this.prisma.subscriptionTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.accent !== undefined ? { accent: data.accent } : {}),
        ...(data.instructions !== undefined ? { instructions: data.instructions as any } : {}),
        ...(data.footer !== undefined ? { footer: data.footer } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.find(id);
    await this.prisma.subscriptionTemplate.delete({ where: { id } });
    return { success: true };
  }
}
