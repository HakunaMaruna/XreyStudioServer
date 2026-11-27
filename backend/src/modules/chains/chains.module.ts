// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConfigModule } from '../config/config.module';
import { ChainsController } from './chains.controller';
import { ChainsService } from './chains.service';

@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [ChainsController],
  providers: [ChainsService],
  exports: [ChainsService],
})
export class ChainsModule {}
