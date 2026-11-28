// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GeodataService } from './geodata.service';

@Controller('geodata')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class GeodataController {
  constructor(private readonly service: GeodataService) {}

  @Get() list(@Query() query: { type?: string; search?: string; enabled?: string }) {
    return this.service.list(query);
  }

  @Post('seed') @Roles(Role.ADMIN) seed() {
    return this.service.seed();
  }

  @Post() @Roles(Role.ADMIN) create(@Body() body: { type: string; code: string; name: string; description?: string; enabled?: boolean }) {
    return this.service.create(body);
  }

  @Patch(':id') @Roles(Role.ADMIN) update(@Param('id') id: string, @Body() body: { name?: string; description?: string; enabled?: boolean }) {
    return this.service.update(id, body);
  }

  @Delete(':id') @Roles(Role.ADMIN) remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
