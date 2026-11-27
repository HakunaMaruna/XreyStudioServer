// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SnapshotBefore } from '../snapshots/snapshot-before.decorator';
import { CreateRoutingDto, UpdateRoutingDto, ValidateRoutingDto } from './dto/routing.dto';
import { RoutingService } from './routing.service';

@Controller('routing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class RoutingController {
  constructor(private readonly service: RoutingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get('recipes/list')
  recipes() {
    return this.service.recipes();
  }

  @Post('validate')
  validate(@Body() body: ValidateRoutingDto) {
    return this.service.validate(body.payload);
  }

  @Post()
  @SnapshotBefore('settings', 'Routing profile creation')
  create(@Body() body: CreateRoutingDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  @SnapshotBefore('settings', 'Routing profile update')
  update(@Param('id') id: string, @Body() body: UpdateRoutingDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @SnapshotBefore('settings', 'Routing profile deletion')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
