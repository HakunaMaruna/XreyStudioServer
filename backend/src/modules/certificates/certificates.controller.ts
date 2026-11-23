import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Get(':nodeId')
  status(@Param('nodeId') nodeId: string) {
    return this.service.status(nodeId);
  }

  @Post(':nodeId/issue')
  issue(@Param('nodeId') nodeId: string) {
    return this.service.issue(nodeId);
  }

  @Post('renew-all')
  renewAll() {
    return this.service.renewAll();
  }
}
