// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { SquadBindingService } from '../inbounds/squad-binding.service';
import { PrismaService } from '../../prisma/prisma.service';

type SquadData = {
  name: string;
  description?: string;
  trafficLimit?: number;
  expiresAt?: string;
  enabled?: boolean;
  organizationId?: string | null;
};

@Injectable()
export class SquadsService {
  constructor(
    private prisma: PrismaService,
    private readonly squadBindings: SquadBindingService,
  ) {}

  // Глобальные (organizationId = null) сквады видимы всем тенантам, но менять
  // их может только ADMIN.
  private readWhere(actor: AuthUser): Prisma.SquadWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { OR: [{ organizationId: actor.organizationId || null }, { organizationId: null }] };
  }

  private writeWhere(actor: AuthUser): Prisma.SquadWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || null };
  }

  private assertOrganization(data: { organizationId?: string | null }, actor: AuthUser) {
    if (actor.role === Role.ADMIN) return;
    if (data.organizationId !== undefined && data.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a squad to another organization');
    }
  }

  list(actor: AuthUser) {
    return this.prisma.squad.findMany({
      where: this.readWhere(actor),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async find(id: string, actor: AuthUser) {
    const found = await this.prisma.squad.findFirst({
      where: { id, ...this.readWhere(actor) },
      include: { users: { select: { id: true, email: true, status: true, trafficUsed: true, trafficLimit: true } } },
    });
    if (!found) throw new NotFoundException('Squad not found');
    return found;
  }

  create(data: SquadData, actor: AuthUser) {
    this.assertOrganization(data, actor);
    return this.prisma.squad.create({
      data: {
        name: data.name,
        description: data.description,
        trafficLimit: BigInt(data.trafficLimit || 0),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        enabled: data.enabled ?? true,
        // Сквад без явной организации — общий дефолт панели (создаёт ADMIN).
        organizationId:
          actor.role === Role.ADMIN
            ? (data.organizationId === '' ? null : (data.organizationId ?? null))
            : (actor.organizationId ?? null),
      },
    });
  }

  async update(id: string, data: Partial<SquadData> & { subscriptionTemplateId?: string | null }, actor: AuthUser) {
    const found = await this.prisma.squad.findFirst({ where: { id, ...this.writeWhere(actor) } });
    if (!found) throw new NotFoundException('Squad not found');
    this.assertOrganization(data, actor);
    if (data.subscriptionTemplateId) {
      const template = await this.prisma.subscriptionTemplate.findFirst({
        where: {
          id: data.subscriptionTemplateId,
          OR: [{ organizationId: actor.organizationId || null }, { organizationId: null }],
        },
        select: { id: true },
      });
      if (!template) throw new ForbiddenException('Subscription template not found in your organization');
    }
    return this.prisma.squad.update({
      where: { id },
      data: {
        ...(data.subscriptionTemplateId !== undefined
          ? {
              subscriptionTemplate: data.subscriptionTemplateId
                ? { connect: { id: data.subscriptionTemplateId } }
                : { disconnect: true },
            }
          : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.trafficLimit !== undefined ? { trafficLimit: BigInt(data.trafficLimit) } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.organizationId !== undefined
          ? { organizationId: data.organizationId === '' ? null : data.organizationId }
          : {}),
      } as any,
    });
  }

  async remove(id: string, actor: AuthUser) {
    const found = await this.prisma.squad.findFirst({ where: { id, ...this.writeWhere(actor) } });
    if (!found) throw new NotFoundException('Squad not found');
    await this.squadBindings.unbindAll(id);
    await this.prisma.squad.delete({ where: { id } });
    return { success: true };
  }

  async setMembers(id: string, userIds: string[], actor: AuthUser) {
    const found = await this.prisma.squad.findFirst({ where: { id, ...this.writeWhere(actor) } });
    if (!found) throw new NotFoundException('Squad not found');
    // Состав сквада ограничен пользователями той же организации.
    const userScope: Prisma.UserWhereInput =
      actor.role === Role.ADMIN ? {} : { organizationId: actor.organizationId || null };
    const members = await this.prisma.user.findMany({
      where: { id: { in: userIds }, ...userScope },
      select: { id: true },
    });
    const allowed = members.map((member) => member.id);
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { squadId: id, ...userScope }, data: { squadId: null } }),
      this.prisma.user.updateMany({ where: { id: { in: allowed }, ...userScope }, data: { squadId: id } }),
    ]);
    await this.squadBindings.syncSquad(id);
    return this.find(id, actor);
  }
}
