// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PERMISSION_KEY } from './permissions';
import { UserGroupsService } from './user-groups.service';

/** Layered authorisation: groups restrict non-admin users, roles stay untouched. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly groups: UserGroupsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    const permissions = await this.groups.permissionsOf(user.userId);
    // Legacy role behaviour for users who have no group yet.
    if (!permissions.length) return true;
    return permissions.includes('*') || permissions.includes(required);
  }
}
