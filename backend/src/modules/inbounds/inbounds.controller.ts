import {
  Body,
  Controller,
  Delete,
  Get,
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
import { AuditService } from '../audit/audit.service';
import { BulkInboundUsersDto, CreateInboundDto, UpdateInboundDto } from './dto/inbound.dto';
import { InboundsService } from './inbounds.service';

@Controller('inbounds')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class InboundsController {
  constructor(
    private service: InboundsService,
    private audit: AuditService,
  ) {}

  @Get()
  list(@Query('nodeId') nodeId?: string, @CurrentUser() user?: AuthUser) {
    return this.service.findAll(nodeId, user);
  }

  @Post()
  async create(@Body() body: CreateInboundDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const created = await this.service.create(body, user);
    await this.audit.log({ userId: user.userId, action: 'inbound.create', entity: 'Inbound', entityId: created.id, ip: req.ip });
    return created;
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post(':id/users/bulk')
  async bulkUsers(
    @Param('id') id: string,
    @Body() body: BulkInboundUsersDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const result = await this.service.bulkUsers(id, body, user);
    await this.audit.log({
      userId: user.userId,
      action: `inbound.users.bulk.${body.mode}`,
      entity: 'Inbound',
      entityId: id,
      ip: req.ip,
      metadata: { scope: body.scope, squadId: body.squadId, ...result },
    });
    return result;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateInboundDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const updated = await this.service.update(id, body, user);
    await this.audit.log({ userId: user.userId, action: 'inbound.update', entity: 'Inbound', entityId: id, ip: req.ip });
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.remove(id, user);
    await this.audit.log({ userId: user.userId, action: 'inbound.delete', entity: 'Inbound', entityId: id, ip: req.ip });
    return result;
  }
}
