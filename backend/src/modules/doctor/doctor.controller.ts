// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DoctorService } from './doctor.service';

@Controller('doctor')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class DoctorController {
  constructor(private service: DoctorService) {}

  @Get()
  check() {
    return this.service.check();
  }

  @Post('fix')
  fix(@Body() body: { checkId: string; entityId?: string }) {
    return this.service.fix(body.checkId, body.entityId);
  }
}
