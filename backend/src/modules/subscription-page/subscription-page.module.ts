// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { SubscriptionPageController } from './subscription-page.controller';
import { SubscriptionPageService } from './subscription-page.service';

@Module({
  controllers: [SubscriptionPageController],
  providers: [SubscriptionPageService],
  exports: [SubscriptionPageService],
})
export class SubscriptionPageModule {}
