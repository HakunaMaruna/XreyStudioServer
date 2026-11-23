import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { sendCsv } from '../../common/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

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
