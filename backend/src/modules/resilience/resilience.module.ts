// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ResilienceController } from './resilience.controller';
import { ResilienceService } from './resilience.service';

@Module({
  imports: [ConfigModule],
  controllers: [ResilienceController],
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}
