import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SnapshotBefore } from '../snapshots/snapshot-before.decorator';
import { AuditService } from '../audit/audit.service';
import { AgentClientService } from '../config/agent-client.service';
import { CreateNodeDto, NodeMetricsDto, RegisterNodeDto, UpdateNodeDto } from './dto/node.dto';
import { NodeGeoDto } from './dto/geo.dto';
import { NodesService } from './nodes.service';

function bearer(value?: string) {
  return (value || '').replace(/^Bearer\s+/i, '');
}

@Controller('nodes')
export class NodesController {
  constructor(
    private service: NodesService,
    private audit: AuditService,
    private agent: AgentClientService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterNodeDto, @Headers('authorization') auth?: string) {
    return this.service.register(body, bearer(auth));
  }

  @Post(':id/metrics')
  metrics(
    @Param('id') id: string,
    @Body() body: NodeMetricsDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.service.metrics(id, body, bearer(auth));
  }

  @Post(':id/geo')
  geo(
    @Param('id') id: string,
    @Body() body: NodeGeoDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.service.reportGeo(id, body, bearer(auth));
  }

  @Get(':id/config')
  agentConfig(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.service.agentConfig(id, bearer(auth));
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  list(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async create(@Body() body: CreateNodeDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const created = await this.service.create(body, user);
    await this.audit.log({
      userId: user.userId,
      action: 'node.create',
      entity: 'Node',
      entityId: created.id,
      ip: req.ip,
    });
    return created;
  }

  @Get('pings')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  pings(@CurrentUser() user: AuthUser) {
    return this.service.pings(user);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateNodeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const updated = await this.service.update(id, body, user);
    await this.audit.log({ userId: user.userId, action: 'node.update', entity: 'Node', entityId: id, ip: req.ip });
    return updated;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.remove(id, user);
    await this.audit.log({ userId: user.userId, action: 'node.delete', entity: 'Node', entityId: id, ip: req.ip });
    return result;
  }

  @Post(':id/rotate-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async rotate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.rotateToken(id, user);
    await this.audit.log({ userId: user.userId, action: 'node.rotateToken', entity: 'Node', entityId: id, ip: req.ip });
    return result;
  }

  @Get(':id/health')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  health(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.health(id, user);
  }

  @Get(':id/logs')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async logs(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('service') service?: string,
    @Query('lines') lines?: string,
  ) {
    const node = await this.service.findOne(id, user);
    return this.agent.getLogs(
      node,
      service === 'singbox' ? 'singbox' : 'xray',
      Math.min(1000, Math.max(1, Number(lines) || 200)),
    );
  }

  @Post(':id/apply')
  @SnapshotBefore('update', 'Node configuration apply')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async apply(
    @Param('id') id: string,
    @Body() body: { revisionId?: string },
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const result = await this.service.applyConfig(id, user, body?.revisionId);
    await this.audit.log({ userId: user.userId, action: 'node.applyConfig', entity: 'Node', entityId: id, ip: req.ip });
    return result;
  }

  @Get(':id/revisions')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  revisions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.revisions(id, user);
  }

  @Post(':id/rollback/:revisionId')
  @SnapshotBefore('update', 'Node configuration rollback')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async rollback(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const result = await this.service.rollback(id, revisionId, user);
    await this.audit.log({ userId: user.userId, action: 'node.rollback', entity: 'Node', entityId: id, ip: req.ip });
    return result;
  }

  @Post(':id/restart')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  async restart(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.restart(id, user);
    await this.audit.log({ userId: user.userId, action: 'node.restartXray', entity: 'Node', entityId: id, ip: req.ip });
    return result;
  }
}
