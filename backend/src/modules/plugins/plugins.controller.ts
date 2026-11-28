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
import { PluginPublishService } from './plugin-publish.service';

@Controller('plugins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class PluginsController {
  constructor(
    private readonly manager: PluginManagerService,
    private readonly catalog: PluginCatalogService,
    private readonly publish: PluginPublishService,
  ) {}

  @Get() list() { return this.manager.list(); }
  @Get('catalog') catalogGet() { return this.catalog.get(); }
  @Post('catalog/refresh') @Roles(Role.ADMIN) catalogRefresh() { return this.catalog.refresh(); }
  @Get('policy') policy() { return this.catalog.policy(); }
  @Patch('policy') @Roles(Role.ADMIN) policyUpdate(@Body() body: Record<string, unknown>) { return this.catalog.updatePolicy(body); }

  @Post('review')
  review(@Body() body: { pkg: any }) { return this.publish.review(body.pkg); }

  @Post('publish')
  publishPlugin(@Body() body: any, @CurrentUser() user: AuthUser) { return this.publish.submit(body, user); }

  @Get('reviews')
  reviews(@CurrentUser() user: AuthUser) { return this.publish.listReviews(user); }

  @Post('reviews/:id/decide')
  decideReview(@Param('id') id: string, @Body() body: { status: string; note?: string }, @CurrentUser() user: AuthUser) {
    return this.publish.decide(id, body, user);
  }

  @Post('download/:versionId') download(@Param('versionId') id: string) { return this.catalog.downloadUrl(id); }
  @Post('install') @Roles(Role.ADMIN) install(@Body() body: { pkg: any }, @CurrentUser() user: AuthUser) {
    return this.manager.install(body.pkg, user);
  }
  @Post(':id/update') @Roles(Role.ADMIN) update(@Param('id') id: string, @Body() body: { pkg: any }, @CurrentUser() user: AuthUser) {
    return this.manager.update(id, body.pkg, user);
  }
  @Post(':id/enable') @Roles(Role.ADMIN) enable(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.enable(id, user); }
  @Post(':id/disable') @Roles(Role.ADMIN) disable(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.disable(id, user); }
  @Post(':id/health') health(@Param('id') id: string) { return this.manager.health(id); }
  @Get(':id/logs') logs(@Param('id') id: string) { return this.manager.logs(id); }
  @Get(':id/settings') @Roles(Role.ADMIN) settings(@Param('id') id: string) { return this.manager.settings(id); }
  @Patch(':id/settings') @Roles(Role.ADMIN) setSettings(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.manager.setSettings(id, body, user);
  }
  @Post(':id/call') call(@Param('id') id: string, @Body() body: { action: string; payload?: unknown }, @CurrentUser() user: AuthUser) {
    return this.manager.call(id, body.action, body.payload || {}, user);
  }
  @Delete(':id') @Roles(Role.ADMIN) remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.manager.uninstall(id, user); }
}
