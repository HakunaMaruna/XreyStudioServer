// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApplyHostDto, CreateHostDto, UpdateHostDto } from './dto/host.dto';
import { HostsService } from './hosts.service';

@Controller('hosts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class HostsController {
  constructor(private service: HostsService) {}

  @Get()
  list() {
    return this.service.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() body: CreateHostDto) {
    return this.service.create(body);
  }

  @Get('recipes/list')
  recipes() {
    return this.service.recipes();
  }

  @Post(':id/apply-to-inbound')
  apply(@Param('id') id: string, @Body() body: ApplyHostDto, @CurrentUser() user: AuthUser) {
    return this.service.applyToInbound(id, body, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() body: UpdateHostDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
