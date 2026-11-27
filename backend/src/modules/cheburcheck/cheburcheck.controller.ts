// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CheburcheckService } from './cheburcheck.service';
import { CheburcheckCheckDto } from './dto/cheburcheck.dto';

@Controller('cheburcheck')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class CheburcheckController {
  constructor(private readonly service: CheburcheckService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('check')
  check(@Body() body: CheburcheckCheckDto, @CurrentUser() user: AuthUser) {
    return this.service.check(body, user);
  }

  @Get('results')
  results(@Query() query: { nodeId?: string; limit?: string }, @CurrentUser() user: AuthUser) {
    return this.service.results(query, user);
  }
}
