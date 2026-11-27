// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeHwid } from '../../common/hwid';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  // Устройство принадлежит пользователю, арендатор берётся из его организации.
  private tenantWhere(actor?: AuthUser): Prisma.DeviceWhereInput {
    if (!actor || actor.role === Role.ADMIN) return {};
    return { user: { organizationId: actor.organizationId || '__none__' } };
  }

  private userScope(actor?: AuthUser): Prisma.UserWhereInput {
    if (!actor || actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || '__none__' };
  }

  async list(userId: string | undefined, actor?: AuthUser) {
    return this.prisma.device.findMany({
      where: { ...this.tenantWhere(actor), ...(userId ? { userId } : {}) },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(userId: string, rawHwid: string, name?: string, actor?: AuthUser) {
    const hwid = normalizeHwid(rawHwid);
    if (!hwid) throw new BadRequestException('hwid is required');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...this.userScope(actor) },
    });
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

  async bind(token: string, rawHwid: string, name?: string) {
    const hwid = normalizeHwid(rawHwid);
    if (!hwid) throw new BadRequestException('hwid is required');
    const user = await this.prisma.user.findUnique({ where: { subscriptionToken: token } });
    if (!user) throw new NotFoundException('Subscription not found');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('User is not active');
    // Токен подписки уже доказывает владение пользователем — тенант не нужен.
    const device = await this.add(user.id, hwid, name);
    return { bound: true, hwid: device.hwid, deviceLimit: user.deviceLimit };
  }

  async remove(id: string, actor?: AuthUser) {
    const device = await this.prisma.device.findFirst({ where: { id, ...this.tenantWhere(actor) } });
    if (!device) throw new NotFoundException('Device not found');
    await this.prisma.device.delete({ where: { id } });
    return { success: true };
  }

  async touch(hwid: string) {
    await this.prisma.device.updateMany({ where: { hwid }, data: { lastSeenAt: new Date() } });
  }
}
