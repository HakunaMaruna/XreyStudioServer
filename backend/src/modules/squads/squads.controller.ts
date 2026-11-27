// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Body, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SquadsService } from './squads.service';

@Controller('squads')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class SquadsController {
  constructor(private readonly service: SquadsService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.find(id, user); }
  @Post() create(@Body() body: any, @CurrentUser() user: AuthUser) { return this.service.create(body, user); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }
  @Patch(':id/members') members(
    @Param('id') id: string,
    @Body() body: { userIds?: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setMembers(id, body.userIds || [], user);
  }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
