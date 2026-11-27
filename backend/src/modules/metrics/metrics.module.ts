// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HostMetricsService } from './host-metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, HostMetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
