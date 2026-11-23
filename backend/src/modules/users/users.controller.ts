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
import { BulkUsersDto, CreateUserDto, UpdateUserDto, UsersQueryDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(
    private service: UsersService,
    private audit: AuditService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  list(@Query() query: UsersQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(query, user);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.OPERATOR)
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  async create(@Body() body: CreateUserDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const created = await this.service.create(body, user);
    await this.audit.log({
      userId: user.userId,
      action: 'user.create',
      entity: 'User',
      entityId: created.id,
      ip: req.ip,
    });
    return created;
  }

  @Post('bulk')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async bulk(@Body() body: BulkUsersDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.bulk(body, user);
    await this.audit.log({
      userId: user.userId,
      action: `user.bulk.${body.action}`,
      entity: 'User',
      metadata: { ids: body.ids },
      ip: req.ip,
    });
    return result;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const updated = await this.service.update(id, body, user);
    await this.audit.log({
      userId: user.userId,
      action: 'user.update',
      entity: 'User',
      entityId: id,
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.remove(id, user);
    await this.audit.log({
      userId: user.userId,
      action: 'user.delete',
      entity: 'User',
      entityId: id,
      ip: req.ip,
    });
    return result;
  }
}
