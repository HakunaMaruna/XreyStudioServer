// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AlertWebhookController } from './alert-webhook.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NodeHttpService } from './node-http.service';
import { NotificationRoutesController } from './notification-routes.controller';
import { NotificationRoutesService } from './notification-routes.service';
import { NotificationSettingsService } from './notification-settings.service';

@Module({
  controllers: [NotificationsController, AlertWebhookController, NotificationRoutesController],
  providers: [NodeHttpService, NotificationsService, NotificationRoutesService, NotificationSettingsService],
  exports: [NotificationsService, NotificationRoutesService, NotificationSettingsService],
})
export class NotificationsModule {}
