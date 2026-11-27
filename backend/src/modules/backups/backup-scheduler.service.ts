// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationEvent } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupsService } from './backups.service';

const SETTINGS_ID = 'default';

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.ensureSettings();
    await this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  async getSettings() {
    return this.ensureSettings();
  }

  async updateSettings(data: { enabled?: boolean; intervalHours?: number; retention?: number }) {
    await this.ensureSettings();
    const settings = await this.prisma.backupSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });
    await this.schedule();
    return settings;
  }

  private async ensureSettings() {
    return this.prisma.backupSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  private async schedule() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const settings = await this.ensureSettings();
    if (!settings.enabled) return;

    const now = Date.now();
    const due = settings.nextRunAt?.getTime() || now;
    const next = due > now ? due : now + settings.intervalHours * 3_600_000;

    if (!settings.nextRunAt || due <= now) {
      await this.prisma.backupSettings.update({
        where: { id: SETTINGS_ID },
        data: { nextRunAt: new Date(next) },
      });
    }

    this.timer = setTimeout(() => this.run(), Math.max(1000, next - Date.now()));
    this.timer.unref?.();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.ensureSettings();
      if (settings.enabled) {
        await this.backups.create('scheduled');
        await this.backups.prune(settings.retention);
        this.logger.log(`Scheduled backup completed (retention=${settings.retention})`);
      }
    } catch (error: any) {
      this.logger.warn(`Scheduled backup failed: ${error.message}`);
      try {
        await this.notifications.emit(
          NotificationEvent.BACKUP_FAILED,
          {
            text: `🔴 Scheduled backup failed: ${error.message}`,
            plainText: `Scheduled backup failed: ${error.message}`,
            subject: 'XSS: backup failed',
            webhook: { event: NotificationEvent.BACKUP_FAILED, error: String(error.message) },
          },
          null,
        );
      } catch (emitError) {
        this.logger.error('Failed to emit BACKUP_FAILED', emitError as Error);
      }
    } finally {
      const settings = await this.ensureSettings();
      await this.prisma.backupSettings.update({
        where: { id: SETTINGS_ID },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + settings.intervalHours * 3_600_000),
        },
      });
      this.running = false;
      await this.schedule();
    }
  }
}
