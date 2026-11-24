import { Module } from '@nestjs/common';
import { SubscriptionTemplatesController } from './subscription-templates.controller';
import { SubscriptionTemplatesService } from './subscription-templates.service';

@Module({
  controllers: [SubscriptionTemplatesController],
  providers: [SubscriptionTemplatesService],
  exports: [SubscriptionTemplatesService],
})
export class SubscriptionTemplatesModule {}
