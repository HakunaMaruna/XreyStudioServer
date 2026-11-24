import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTokenGuard, ApiTokenUser, RequireScope } from '../api-tokens/api-token.guard';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { ControlService } from './control.service';
import { AllocateDomainDto, BindDomainDto, IssueCertificateDto } from './dto/control.dto';

@Controller('control')
@UseGuards(ApiTokenGuard)
@RequireScope('NODE_DOMAIN' as any)
export class ControlController {
  constructor(private readonly service: ControlService) {}

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
