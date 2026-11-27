// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginManagerService } from './plugin-manager.service';

@Controller('plugins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class PluginsController {
  constructor(
    private readonly manager: PluginManagerService,
    private readonly catalog: PluginCatalogService,
  ) {}

  @Get() list() { return this.manager.list(); }
  @Get('catalog') catalogGet() { return this.catalog.get(); }
  @Post('catalog/refresh') catalogRefresh() { return this.catalog.refresh(); }
  @Get('policy') policy() { return this.catalog.policy(); }
  @Patch('policy') policyUpdate(@Body() body: Record<string, unknown>) { return this.catalog.updatePolicy(body); }

  @Post('download/:versionId') download(@Param('versionId') id: string) { return this.catalog.downloadUrl(id); }
  @Post('install') install(@Body() body: { pkg: any }, @CurrentUser() user: AuthUser) {
    return this.manager.install(body.pkg, user);
  }
  @Post(':id/update') update(@Param('id') id: string, @Body() body: { pkg: any }, @CurrentUser() user: AuthUser) {
    return this.manager.update(id, body.pkg, user);
  }
  @Post(':id/enable') enable(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.enable(id, user); }
  @Post(':id/disable') disable(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.disable(id, user); }
  @Post(':id/health') health(@Param('id') id: string) { return this.manager.health(id); }
  @Get(':id/logs') logs(@Param('id') id: string) { return this.manager.logs(id); }
  @Get(':id/settings') settings(@Param('id') id: string) { return this.manager.settings(id); }
  @Patch(':id/settings') setSettings(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.manager.setSettings(id, body, user);
  }
  @Post(':id/call') call(@Param('id') id: string, @Body() body: { action: string; payload?: unknown }, @CurrentUser() user: AuthUser) {
    return this.manager.call(id, body.action, body.payload || {}, user);
  }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.uninstall(id, user); }
}
