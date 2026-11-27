// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Body, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SnapshotBefore } from '../snapshots/snapshot-before.decorator';
import { ConfigProfilesService } from './config-profiles.service';
import { CreateConfigProfileDto, UpdateConfigProfileDto } from './dto/config-profile.dto';

@Controller('config-profiles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ConfigProfilesController {
  constructor(private readonly service: ConfigProfilesService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.find(id, user); }
  @Post()
  @SnapshotBefore('settings', 'Config profile creation')
  create(@Body() body: CreateConfigProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }
  @Patch(':id')
  @SnapshotBefore('settings', 'Config profile update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateConfigProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, body, user);
  }
  @Delete(':id')
  @SnapshotBefore('settings', 'Config profile deletion')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
