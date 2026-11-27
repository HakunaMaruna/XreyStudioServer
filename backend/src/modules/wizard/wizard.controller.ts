// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateNodeWizardDto } from './dto/wizard.dto';
import { UpdateWizardNodeDto } from './dto/update-wizard-node.dto';
import { WizardService } from './wizard.service';

@Controller('wizard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WizardController {
  constructor(private readonly service: WizardService) {}

  @Post('nodes')
  @Roles(Role.ADMIN, Role.OPERATOR)
  create(@Body() dto: CreateNodeWizardDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('install/:installId')
  @Roles(Role.ADMIN, Role.OPERATOR)
  installation(@Param('installId') installId: string, @CurrentUser() user: AuthUser) {
    return this.service.installation(installId, user);
  }

  @Get('nodes/:nodeId')
  @Roles(Role.ADMIN, Role.OPERATOR)
  nodeParams(@Param('nodeId') nodeId: string, @CurrentUser() user: AuthUser) {
    return this.service.getNodeParams(nodeId, user);
  }

  @Patch('nodes/:nodeId')
  @Roles(Role.ADMIN, Role.OPERATOR)
  updateNodeParams(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateWizardNodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateNodeParams(nodeId, dto, user);
  }

  @Get('credentials')
  @Roles(Role.ADMIN)
  credentials() {
    return this.service.listCredentials();
  }

  @Delete('credentials/:nodeId')
  @Roles(Role.ADMIN)
  removeCredentials(@Param('nodeId') nodeId: string) {
    return this.service.removeCredentials(nodeId);
  }

  @Post('certificates/retry')
  @Roles(Role.ADMIN, Role.OPERATOR)
  retryCertificate(@Body() body: { domainId: string }, @CurrentUser() user: AuthUser) {
    return this.service.retryCertificate(body.domainId, user);
  }
}
