import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupSchedulerService],
  exports: [BackupsService],
})
export class BackupsModule {}
