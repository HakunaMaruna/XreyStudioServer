import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DnsAdminService } from './dns-admin.service';
import { CreateZoneDto, SetRecordDto, UpdateDnsSettingsDto } from './dto/dns-admin.dto';

@Controller('dns')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class DnsController {
  constructor(private readonly service: DnsAdminService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('zones')
  zones() {
    return this.service.zones();
  }

  @Post('zones')
  createZone(@Body() body: CreateZoneDto) {
    return this.service.createZone(body);
  }

  @Delete('zones/:name')
  deleteZone(@Param('name') name: string) {
    return this.service.deleteZone(name);
  }

  @Get('zone/:zone/records')
  records(@Param('zone') zone: string) {
    return this.service.records(decodeURIComponent(zone));
  }

  @Post('zone/:zone/records')
  setRecord(@Param('zone') zone: string, @Body() body: SetRecordDto) {
    return this.service.setRecord(decodeURIComponent(zone), body);
  }

  @Delete('zone/:zone/records')
  deleteRecord(
    @Param('zone') zone: string,
    @Query('name') name: string,
    @Query('type') type: string,
  ) {
    return this.service.deleteRecord(decodeURIComponent(zone), name, type);
  }

  @Get('settings')
  settings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: UpdateDnsSettingsDto) {
    return this.service.updateSettings(body as any);
  }
}
