import { Module } from '@nestjs/common';
import { ChainsModule } from '../chains/chains.module';
import { DevicesModule } from '../devices/devices.module';
import { SubscriptionPageModule } from '../subscription-page/subscription-page.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [DevicesModule, SubscriptionPageModule, ChainsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
