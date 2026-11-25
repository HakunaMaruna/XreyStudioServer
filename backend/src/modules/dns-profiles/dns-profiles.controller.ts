import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DnsProfilesService } from './dns-profiles.service';
import { CreateDnsProfileDto, UpdateDnsProfileDto, ValidateDnsProfileDto } from './dto/dns-profile.dto';

@Controller('dns-profiles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class DnsProfilesController {
  constructor(private readonly service: DnsProfilesService) {}

  @Get('recipes/list')
  recipes() { return this.service.recipes(); }

  @Post('validate')
  validate(@Body() body: ValidateDnsProfileDto) { return this.service.validate(body.payload); }

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.service.list(user); }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.get(id, user); }

  @Post()
  create(@Body() body: CreateDnsProfileDto, @CurrentUser() user: AuthUser) { return this.service.create(body, user); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateDnsProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.remove(id, user); }
}
