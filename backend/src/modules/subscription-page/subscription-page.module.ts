import { Module } from '@nestjs/common';
import { SubscriptionPageController } from './subscription-page.controller';
import { SubscriptionPageService } from './subscription-page.service';

@Module({
  controllers: [SubscriptionPageController],
  providers: [SubscriptionPageService],
  exports: [SubscriptionPageService],
})
export class SubscriptionPageModule {}
