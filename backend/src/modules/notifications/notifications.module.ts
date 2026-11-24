import { Module } from '@nestjs/common';
import { AlertWebhookController } from './alert-webhook.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationRoutesController } from './notification-routes.controller';
import { NotificationRoutesService } from './notification-routes.service';

@Module({
  controllers: [NotificationsController, AlertWebhookController, NotificationRoutesController],
  providers: [NotificationsService, NotificationRoutesService],
  exports: [NotificationsService, NotificationRoutesService],
})
export class NotificationsModule {}
