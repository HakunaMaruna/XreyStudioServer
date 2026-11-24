import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async list(userId?: string) {
    return this.prisma.device.findMany({
      where: userId ? { userId } : {},
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(userId: string, hwid: string, name?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const existing = await this.prisma.device.findUnique({ where: { hwid } });
    if (existing && existing.userId !== userId) throw new ForbiddenException('Device belongs to another user');
    if (!existing && user.deviceLimit > 0) {
      const count = await this.prisma.device.count({ where: { userId } });
      if (count >= user.deviceLimit) throw new ForbiddenException('Device limit reached');
    }
    return this.prisma.device.upsert({
      where: { hwid },
      create: { userId, hwid, name },
      update: { name: name ?? undefined, lastSeenAt: new Date() },
    });
  }

  async bind(token: string, hwid: string, name?: string) {
    const user = await this.prisma.user.findUnique({ where: { subscriptionToken: token } });
    if (!user) throw new NotFoundException('Subscription not found');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('User is not active');
    const device = await this.add(user.id, hwid, name);
    return { bound: true, hwid: device.hwid, deviceLimit: user.deviceLimit };
  }

  async remove(id: string, userId?: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    if (userId && device.userId !== userId) throw new ForbiddenException('Device belongs to another user');
    await this.prisma.device.delete({ where: { id } });
    return { success: true };
  }

  async touch(hwid: string) {
    await this.prisma.device.updateMany({ where: { hwid }, data: { lastSeenAt: new Date() } });
  }
}
