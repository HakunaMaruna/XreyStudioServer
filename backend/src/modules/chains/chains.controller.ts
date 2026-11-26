import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ChainsService } from './chains.service';
import { BindChainDto, CreateChainDto, UpdateChainDto } from './dto/chain.dto';

@Controller('chains')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ChainsController {
  constructor(private readonly service: ChainsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.service.list(user) };
  }

  @Get('binding/user/:userId')
  bindingForUser(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    return this.service.bindingForUser(userId, user.organizationId);
  }

  @Delete('binding/user/:userId')
  unbindUser(@Param('userId') userId: string) {
    return this.service.unbindUser(userId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.status(id, user);
  }

  @Post()
  create(@Body() body: CreateChainDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateChainDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.apply(id, user);
  }

  @Post(':id/bind')
  bind(@Param('id') id: string, @Body() body: BindChainDto, @CurrentUser() user: AuthUser) {
    return this.service.bind(id, body, user);
  }

  @Delete(':id/bind/:bindingId')
  unbind(@Param('id') id: string, @Param('bindingId') bindingId: string, @CurrentUser() user: AuthUser) {
    return this.service.unbind(id, bindingId, user);
  }
}
