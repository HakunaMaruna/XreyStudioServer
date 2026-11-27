// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { SnapshotBeforeInterceptor } from './snapshot-before.interceptor';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [AuditModule],
  controllers: [SnapshotsController],
  providers: [
    SnapshotsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SnapshotBeforeInterceptor,
    },
  ],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}
