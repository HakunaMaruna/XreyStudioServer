import { Controller, Body, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConfigProfilesService } from './config-profiles.service';
import { CreateConfigProfileDto, UpdateConfigProfileDto } from './dto/config-profile.dto';

@Controller('config-profiles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ConfigProfilesController {
  constructor(private readonly service: ConfigProfilesService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.find(id, user); }
  @Post() create(@Body() body: CreateConfigProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: UpdateConfigProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, body, user);
  }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
