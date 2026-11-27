// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { PowerDnsService } from './powerdns.service';
import { DnsSettingsService } from './dns-settings.service';
import { DnsAdminService } from './dns-admin.service';
import { DnsController } from './dns.controller';
import { PluginsModule } from '../plugins/plugins.module';

@Module({
  imports: [ApiTokensModule, PluginsModule],
  controllers: [ControlController, DnsController],
  providers: [ControlService, PowerDnsService, DnsSettingsService, DnsAdminService],
  exports: [ControlService, PowerDnsService, DnsSettingsService, DnsAdminService],
})
export class ControlModule {}
