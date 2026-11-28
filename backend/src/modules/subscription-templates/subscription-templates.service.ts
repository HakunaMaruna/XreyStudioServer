// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type TemplateData = {
  name: string;
  title: string;
  description?: string;
  accent?: string;
  instructions?: unknown;
  footer?: string;
  pageSettings?: unknown;
  enabled?: boolean;
  isDefault?: boolean;
  organizationId?: string | null;
};

@Injectable()
export class SubscriptionTemplatesService {
  constructor(private prisma: PrismaService) {}

  // Глобальные шаблоны (organizationId = null) — общие дефолты панели.
  private readWhere(actor: AuthUser): Prisma.SubscriptionTemplateWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { OR: [{ organizationId: actor.organizationId || null }, { organizationId: null }] };
  }

  private writeWhere(actor: AuthUser): Prisma.SubscriptionTemplateWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || null };
  }

  private assertOrganization(data: { organizationId?: string | null }, actor: AuthUser) {
    if (actor.role === Role.ADMIN) return;
    if (data.organizationId !== undefined && data.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a template to another organization');
    }
  }

  list(actor: AuthUser) {
    return this.prisma.subscriptionTemplate.findMany({
      where: this.readWhere(actor),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, squads: true } } },
    });
  }

  async find(id: string, actor: AuthUser) {
    const found = await this.prisma.subscriptionTemplate.findFirst({
      where: { id, ...this.readWhere(actor) },
    });
    if (!found) throw new NotFoundException('Subscription template not found');
    return found;
  }

  async create(data: TemplateData, actor: AuthUser) {
    this.assertOrganization(data, actor);
    if (data.isDefault) await this.clearDefault(data.organizationId || null);
    return this.prisma.subscriptionTemplate.create({
      data: {
        name: data.name,
        title: data.title,
        description: data.description,
        accent: data.accent || '#8474ff',
        instructions: data.instructions as any,
        footer: data.footer,
        pageSettings: data.pageSettings as any,
        enabled: data.enabled ?? true,
        isDefault: data.isDefault ?? false,
        // Шаблон без явной организации — общий дефолт панели (создаёт ADMIN).
        organizationId:
          actor.role === Role.ADMIN
            ? (data.organizationId === '' ? null : (data.organizationId ?? null))
            : (actor.organizationId ?? null),
      },
    });
  }

  private async clearDefault(organizationId: string | null | undefined, exceptId?: string) {
    await this.prisma.subscriptionTemplate.updateMany({
      where: {
        isDefault: true,
        OR: [{ organizationId: organizationId || null }, { organizationId: null }],
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async update(id: string, data: Partial<TemplateData>, actor: AuthUser) {
    const found = await this.prisma.subscriptionTemplate.findFirst({
      where: { id, ...this.writeWhere(actor) },
    });
    if (!found) throw new NotFoundException('Subscription template not found');
    this.assertOrganization(data, actor);
    if (data.isDefault === true) await this.clearDefault(found.organizationId, id);
    return this.prisma.subscriptionTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.accent !== undefined ? { accent: data.accent } : {}),
        ...(data.instructions !== undefined ? { instructions: data.instructions as any } : {}),
        ...(data.footer !== undefined ? { footer: data.footer } : {}),
        ...(data.pageSettings !== undefined ? { pageSettings: data.pageSettings as any } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.organizationId !== undefined
          ? { organizationId: data.organizationId === '' ? null : data.organizationId }
          : {}),
      },
    });
  }

  async remove(id: string, actor: AuthUser) {
    const found = await this.prisma.subscriptionTemplate.findFirst({
      where: { id, ...this.writeWhere(actor) },
    });
    if (!found) throw new NotFoundException('Subscription template not found');
    await this.prisma.subscriptionTemplate.delete({ where: { id } });
    return { success: true };
  }
}
