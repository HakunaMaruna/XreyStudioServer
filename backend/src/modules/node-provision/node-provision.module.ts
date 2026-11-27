// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NodeProvisionController } from './node-provision.controller';
import { NodeProvisionService } from './node-provision.service';

@Module({
  imports: [AuditModule],
  controllers: [NodeProvisionController],
  providers: [NodeProvisionService],
  exports: [NodeProvisionService],
})
export class NodeProvisionModule {}
