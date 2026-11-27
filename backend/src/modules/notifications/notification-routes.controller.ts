// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationChannel, NotificationEvent, Role } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { NotificationRoutesService } from './notification-routes.service';

class SetRouteDto {
  @IsIn(Object.values(NotificationEvent))
  event!: NotificationEvent;

  @IsIn(Object.values(NotificationChannel))
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

@Controller('notification-routes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class NotificationRoutesController {
  constructor(private routes: NotificationRoutesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.routes.list(user.role === Role.ADMIN ? null : (user.organizationId ?? null));
  }

  @Post()
  set(@Body() dto: SetRouteDto, @CurrentUser() user: AuthUser) {
    return this.routes.set({
      ...dto,
      organizationId: user.role === Role.ADMIN ? null : (user.organizationId ?? null),
    });
  }
}
