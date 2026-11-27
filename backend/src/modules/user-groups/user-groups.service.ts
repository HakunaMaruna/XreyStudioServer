// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS, MODERATOR_PERMISSIONS } from './permissions';

@Injectable()
export class UserGroupsService implements OnModuleInit {
  private readonly logger = new Logger(UserGroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults().catch((error) => this.logger.warn(`User group seed failed: ${error.message}`));
  }

  async ensureDefaults() {
    for (const [name, permissions] of [
      ['Administrator', ['*']],
      ['Moderator', MODERATOR_PERMISSIONS],
    ] as const) {
      const existing = await this.prisma.userGroup.findUnique({ where: { name } });
      if (!existing) {
        await this.prisma.userGroup.create({ data: { name, system: true, description: name === 'Administrator' ? 'Full panel access' : 'Manage connections', permissions: permissions as any } });
      }
    }
    const admin = await this.prisma.userGroup.findUnique({ where: { name: 'Administrator' }, include: { members: true } });
    if (admin) {
      const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
      for (const user of admins) {
        if (!admin.members.some((member) => member.userId === user.id)) {
          await this.prisma.userGroupMember.create({ data: { groupId: admin.id, userId: user.id } });
        }
      }
    }
  }

  list() {
    return this.prisma.userGroup.findMany({
      orderBy: [{ system: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { members: true } } },
    });
  }

  async find(id: string) {
    const group = await this.prisma.userGroup.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, email: true, role: true } } } } },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async create(data: { name: string; description?: string; permissions?: string[] }) {
    if (!data.name?.trim()) throw new ForbiddenException('Name is required');
    const permissions = this.normalizePermissions(data.permissions);
    return this.prisma.userGroup.create({
      data: { name: data.name.trim(), description: data.description?.trim() || null, permissions: permissions as any },
    });
  }

  async update(id: string, data: { name?: string; description?: string; permissions?: string[] }) {
    const group = await this.prisma.userGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');
    return this.prisma.userGroup.update({
      where: { id },
      data: {
        ...(data.name?.trim() && !group.system ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.permissions !== undefined ? { permissions: this.normalizePermissions(data.permissions) as any } : {}),
      },
    });
  }

  async remove(id: string) {
    const group = await this.prisma.userGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');
    if (group.system) throw new ForbiddenException('System groups cannot be deleted');
    await this.prisma.userGroup.delete({ where: { id } });
    return { success: true };
  }

  async setMembers(id: string, userIds: string[]) {
    const group = await this.prisma.userGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');
    await this.prisma.$transaction([
      this.prisma.userGroupMember.deleteMany({ where: { groupId: id } }),
      ...(userIds.length
        ? [this.prisma.userGroupMember.createMany({ data: userIds.map((userId) => ({ groupId: id, userId })), skipDuplicates: true })]
        : []),
    ]);
    return this.find(id);
  }

  async permissionsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.userGroupMember.findMany({
      where: { userId },
      select: { group: { select: { permissions: true } } },
    });
    const result = new Set<string>();
    for (const row of rows) {
      const permissions = Array.isArray(row.group.permissions) ? row.group.permissions : [];
      for (const permission of permissions) result.add(String(permission));
    }
    return [...result];
  }

  private normalizePermissions(values?: string[]): string[] {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value) => value === '*' || ALL_PERMISSIONS.includes(value)))];
  }
}
