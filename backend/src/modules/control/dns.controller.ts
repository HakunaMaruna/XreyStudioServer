import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DnsAdminService } from './dns-admin.service';
import {
  CreateDnssecKeyDto, CreateZoneDto, SetDnssecDto, SetRecordDto,
  UpdateDnssecKeyDto, UpdateDnsSettingsDto,
} from './dto/dns-admin.dto';

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

  @Get('zone/:zone/dnssec')
  dnssec(@Param('zone') zone: string) {
    return this.service.dnssec(decodeURIComponent(zone));
  }

  @Patch('zone/:zone/dnssec')
  setDnssec(@Param('zone') zone: string, @Body() body: SetDnssecDto) {
    return this.service.setDnssec(decodeURIComponent(zone), body.enabled);
  }

  @Post('zone/:zone/dnssec/keys')
  createDnssecKey(@Param('zone') zone: string, @Body() body: CreateDnssecKeyDto) {
    return this.service.createDnssecKey(decodeURIComponent(zone), body);
  }

  @Patch('zone/:zone/dnssec/keys/:id')
  updateDnssecKey(@Param('zone') zone: string, @Param('id') id: string, @Body() body: UpdateDnssecKeyDto) {
    return this.service.updateDnssecKey(decodeURIComponent(zone), Number(id), body);
  }

  @Delete('zone/:zone/dnssec/keys/:id')
  deleteDnssecKey(@Param('zone') zone: string, @Param('id') id: string) {
    return this.service.deleteDnssecKey(decodeURIComponent(zone), Number(id));
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
