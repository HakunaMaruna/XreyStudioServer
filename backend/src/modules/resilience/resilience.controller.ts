// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResilienceService } from './resilience.service';

@Controller('resilience')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class ResilienceController {
  constructor(private readonly service: ResilienceService) {}

  @Get('quarantine')
  list() {
    return this.service.listQuarantine();
  }

  @Post('quarantine')
  quarantine(@Body() body: { address: string; nodeId?: string; reason?: string; hours?: number }) {
    return this.service.quarantine(body);
  }

  @Delete('quarantine/:address')
  release(@Param('address') address: string) {
    return this.service.releaseQuarantine(address);
  }

  @Post('auto-quarantine')
  auto(@Body() body: { hours?: number }) {
    return this.service.autoQuarantine(body?.hours);
  }

  /** Rotate Reality shortId and (optionally) SNI from REALITY_SNI_POOL. */
  @Post('rotate-sni')
  rotate(@Body() body: { nodeId?: string }) {
    return this.service.rotateSni(body?.nodeId);
  }
}
