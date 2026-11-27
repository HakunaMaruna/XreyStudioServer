// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from './permissions';
import { UserGroupsService } from './user-groups.service';

@Controller('user-groups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class UserGroupsController {
  constructor(private readonly service: UserGroupsService) {}

  @Get() list() { return this.service.list(); }
  @Get('permissions') catalog() { return { groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS }; }
  @Get(':id') get(@Param('id') id: string) { return this.service.find(id); }
  @Post() create(@Body() body: { name: string; description?: string; permissions?: string[] }) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: { name?: string; description?: string; permissions?: string[] }) { return this.service.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Post(':id/members') members(@Param('id') id: string, @Body() body: { userIds?: string[] }) { return this.service.setMembers(id, body?.userIds || []); }
}
