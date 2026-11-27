// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { HealthChecksController } from './health-checks.controller';
import { HealthChecksService } from './health-checks.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [HealthChecksController],
  imports: [NotificationsModule],
  providers: [HealthChecksService],
  exports: [HealthChecksService],
})
export class HealthChecksModule {}
