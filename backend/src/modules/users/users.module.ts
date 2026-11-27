// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InboundsModule } from '../inbounds/inbounds.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ExternalLinksService } from './external-links.service';

@Module({
  imports: [AuditModule, InboundsModule],
  controllers: [UsersController],
  providers: [UsersService, ExternalLinksService],
  exports: [UsersService, ExternalLinksService],
})
export class UsersModule {}
