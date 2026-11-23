import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { sendCsv } from '../../common/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get('export.csv')
  async export(@Query() query: any, @Res() res: any) {
    sendCsv(res, 'audit.csv', await this.audit.exportCsv(query));
  }

  @Get()
  list(@Query() query: any) {
    return this.audit.findAll(query);
  }
}
