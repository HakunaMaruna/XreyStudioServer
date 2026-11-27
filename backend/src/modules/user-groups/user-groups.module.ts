// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { UserGroupsController } from './user-groups.controller';
import { UserGroupsService } from './user-groups.service';

@Module({
  controllers: [UserGroupsController],
  providers: [UserGroupsService, PermissionsGuard],
  exports: [UserGroupsService, PermissionsGuard],
})
export class UserGroupsModule {}
