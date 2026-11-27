// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { DnsProfilesController } from './dns-profiles.controller';
import { DnsProfilesService } from './dns-profiles.service';

@Module({
  controllers: [DnsProfilesController],
  providers: [DnsProfilesService],
  exports: [DnsProfilesService],
})
export class DnsProfilesModule {}
