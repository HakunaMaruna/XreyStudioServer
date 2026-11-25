import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { ProvisionNodeDto } from './dto/provision.dto';
import { UpdateNodeAgentDto } from './dto/update-agent.dto';
import { NodeProvisionService } from './node-provision.service';

@Controller('node-provision')
export class NodeProvisionController {
  constructor(
    private service: NodeProvisionService,
    private audit: AuditService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  provision(@Body() dto: ProvisionNodeDto, @CurrentUser() user: AuthUser) {
    return this.service.provision(dto, user);
  }

  @Post(':nodeId/update')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async updateAgent(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeAgentDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const result = await this.service.updateAgent(nodeId, dto, user);
    await this.audit.log({
      userId: user.userId,
      action: 'node.updateAgent',
      entity: 'Node',
      entityId: nodeId,
      ip: req.ip,
    });
    return result;
  }
}
