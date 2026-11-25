import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { EnvAuthProvider } from './auth-provider';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginManagerService } from './plugin-manager.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginsController } from './plugins.controller';

@Module({
  imports: [AuditModule, NotificationsModule, SnapshotsModule],
  controllers: [PluginsController],
  providers: [
    EnvAuthProvider,
    PluginStorageService,
    PluginRuntimeService,
    PluginCatalogService,
    PluginManagerService,
  ],
  exports: [PluginManagerService, PluginCatalogService],
})
export class PluginsModule {}
