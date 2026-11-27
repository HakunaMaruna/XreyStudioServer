// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HealthChecksService } from './health-checks.service';

@Controller('health-checks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class HealthChecksController {
  constructor(private readonly service: HealthChecksService) {}

  @Get()
  list(@Query() query: { nodeId?: string; limit?: string }) {
    return this.service.list(query);
  }

  @Get('latest')
  latest() {
    return this.service.latest();
  }
}
