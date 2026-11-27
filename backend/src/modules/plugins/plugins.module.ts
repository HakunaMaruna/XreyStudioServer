// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { EnvAuthProvider } from './auth-provider';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginManagerService } from './plugin-manager.service';
import { PluginRecipeService } from './plugin-recipe.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginsController } from './plugins.controller';

@Module({
  imports: [AuditModule, NotificationsModule, SnapshotsModule],
  controllers: [PluginsController],
  providers: [
    EnvAuthProvider,
    PluginStorageService,
    PluginRecipeService,
    PluginRuntimeService,
    PluginCatalogService,
    PluginManagerService,
  ],
  exports: [PluginManagerService, PluginCatalogService, PluginRecipeService],
})
export class PluginsModule {}
