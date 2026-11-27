// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { sendCsv } from '../../common/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** Trigger the full Telegram metrics report immediately. */
  @Post('telegram')
  telegram() {
    return this.service.telegramDigest(true);
  }

  @Get('cheburcheck')
  cheburcheck(@Query() query: { from?: string; to?: string }) {
    return this.service.cheburcheck(query);
  }

  @Get('cheburcheck.csv')
  async cheburcheckCsv(@Query() query: { from?: string; to?: string }, @Res() res: any) {
    sendCsv(res, 'cheburcheck.csv', await this.service.cheburcheckCsv(query));
  }

  @Get('traffic/timeseries')
  traffic(@Query() query: { from?: string; to?: string; days?: string }) {
    return this.service.trafficTimeseries(query);
  }

  @Get('traffic/timeseries.csv')
  async trafficCsv(@Query() query: { from?: string; to?: string; days?: string }, @Res() res: any) {
    sendCsv(res, 'traffic-timeseries.csv', await this.service.trafficTimeseriesCsv(query));
  }

  @Get('organizations')
  organizations(@Query() query: { from?: string; to?: string }) {
    return this.service.organizations(query);
  }

  @Get('organizations.csv')
  async organizationsCsv(@Query() query: { from?: string; to?: string }, @Res() res: any) {
    sendCsv(res, 'organizations.csv', await this.service.organizationsCsv(query));
  }

  @Get('protocols')
  protocols() {
    return this.service.protocols();
  }

  @Get('protocols.csv')
  async protocolsCsv(@Res() res: any) {
    sendCsv(res, 'protocols.csv', await this.service.protocolsCsv());
  }
}
