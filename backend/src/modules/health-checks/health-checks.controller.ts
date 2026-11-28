// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { HealthChecksService } from './health-checks.service';

@Controller('health-checks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class HealthChecksController {
  constructor(private readonly service: HealthChecksService) {}

  @Get()
  list(@Query() query: { nodeId?: string; limit?: string }, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user);
  }

  @Get('latest')
  latest(@CurrentUser() user: AuthUser) {
    return this.service.latest(user);
  }
}
