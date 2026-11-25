import { Module } from '@nestjs/common';
import { AlertWebhookController } from './alert-webhook.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationRoutesController } from './notification-routes.controller';
import { NotificationRoutesService } from './notification-routes.service';
import { NotificationSettingsService } from './notification-settings.service';

@Module({
  controllers: [NotificationsController, AlertWebhookController, NotificationRoutesController],
  providers: [NotificationsService, NotificationRoutesService, NotificationSettingsService],
  exports: [NotificationsService, NotificationRoutesService, NotificationSettingsService],
})
export class NotificationsModule {}
