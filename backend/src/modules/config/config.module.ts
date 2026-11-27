// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BalancersModule } from '../balancers/balancers.module';
import { DnsProfilesModule } from '../dns-profiles/dns-profiles.module';
import { AgentClientService } from './agent-client.service';
import { ConfigGeneratorService } from './config-generator.service';

@Module({
  imports: [NotificationsModule, BalancersModule, DnsProfilesModule],
  providers: [ConfigGeneratorService, AgentClientService],
  exports: [ConfigGeneratorService, AgentClientService],
})
export class ConfigModule {}
