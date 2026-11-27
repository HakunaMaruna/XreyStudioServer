// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ConfigProfilesController } from './config-profiles.controller';
import { ConfigProfilesService } from './config-profiles.service';

@Module({
  controllers: [ConfigProfilesController],
  providers: [ConfigProfilesService],
  exports: [ConfigProfilesService],
})
export class ConfigProfilesModule {}
