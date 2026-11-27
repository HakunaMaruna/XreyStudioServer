// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { SubscriptionTemplatesController } from './subscription-templates.controller';
import { SubscriptionTemplatesService } from './subscription-templates.service';

@Module({
  controllers: [SubscriptionTemplatesController],
  providers: [SubscriptionTemplatesService],
  exports: [SubscriptionTemplatesService],
})
export class SubscriptionTemplatesModule {}
