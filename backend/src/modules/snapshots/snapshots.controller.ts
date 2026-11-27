// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { RestoreSnapshotDto } from './dto/restore-snapshot.dto';
import { SnapshotPolicyDto } from './dto/snapshot-policy.dto';
import { SnapshotsService } from './snapshots.service';

@Controller('snapshots')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class SnapshotsController {
  constructor(private readonly service: SnapshotsService) {}

  @Get()
  list() {
    return this.service.list().then((items) => ({ items }));
  }

  @Get('policy')
  getPolicy() {
    return this.service.getPolicy();
  }

  @Patch('policy')
  updatePolicy(@Body() body: SnapshotPolicyDto) {
    return this.service.updatePolicy(body);
  }

  @Post()
  create(@Body() body: CreateSnapshotDto, @CurrentUser() user: AuthUser) {
    return this.service.create({ ...body, actorId: user?.userId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Body() body: RestoreSnapshotDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.restore(id, body, user?.userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.delete(id, user?.userId);
  }
}
