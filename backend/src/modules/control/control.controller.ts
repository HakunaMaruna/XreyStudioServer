// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTokenGuard, ApiTokenUser, RequireScope } from '../api-tokens/api-token.guard';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { ControlService } from './control.service';
import { PluginCatalogService } from '../plugins/plugin-catalog.service';
import { AllocateDomainDto, BindDomainDto, IssueCertificateDto } from './dto/control.dto';

@Controller('control')
@UseGuards(ApiTokenGuard)
@RequireScope('NODE_DOMAIN' as any)
export class ControlController {
  constructor(
    private readonly service: ControlService,
    private readonly catalog: PluginCatalogService,
  ) {}

  @Get('plugins/catalog')
  pluginCatalog() {
    return this.catalog.masterCatalog();
  }

  @Get('plugins/revocations')
  pluginRevocations() {
    return this.catalog.revocations();
  }

  @Get('plugins/download/:id')
  pluginDownload(@Param('id') id: string) {
    return this.catalog.downloadUrl(id);
  }

  @Post('domains')
  allocate(@Body() body: AllocateDomainDto, @ApiTokenUser() token: ApiTokenContext) {
    return this.service.allocate(body, token);
  }

  @Get('domains')
  list(@ApiTokenUser() token: ApiTokenContext) {
    return this.service.list(token);
  }

  @Delete('domains/:id')
  release(@Param('id') id: string, @ApiTokenUser() token: ApiTokenContext) {
    return this.service.release(id, token);
  }

  @Patch('domains/:id/bind')
  bind(@Param('id') id: string, @Body() body: BindDomainDto, @ApiTokenUser() token: ApiTokenContext) {
    return this.service.bindNode(id, body.nodeId, token);
  }

  @Post('certificates')
  issue(@Body() body: IssueCertificateDto, @ApiTokenUser() token: ApiTokenContext) {
    return this.service.issueCertificate(body.domainId, token);
  }
}
