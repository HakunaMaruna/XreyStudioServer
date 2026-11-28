// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

export type PanelSettings = {
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  alertsEnabled: boolean;
  notifyOnNodeOffline: boolean;
  notifyOnBackup: boolean;
  metricsEnabled: boolean;
  rateLimit: number;
  corsOrigin: string;
  sessionMinutes: number;
  updateCheckEnabled: boolean;
  updateChannel: 'stable' | 'dev';
};

const DEFAULTS: PanelSettings = {
  language: 'ru',
  theme: 'dark',
  alertsEnabled: true,
  notifyOnNodeOffline: true,
  notifyOnBackup: false,
  metricsEnabled: true,
  rateLimit: 120,
  corsOrigin: '*',
  sessionMinutes: 15,
  updateCheckEnabled: true,
  updateChannel: 'stable',
};

const FILE = process.env.SETTINGS_FILE || path.resolve(process.env.BACKUP_DIR || 'backups', 'panel-settings.json');

@Injectable()
export class SettingsService {
  async get(): Promise<PanelSettings> {
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async update(input: Partial<PanelSettings>): Promise<PanelSettings> {
    const current = await this.get();
    // Только известные ключи с типом как у дефолта: тело запроса не валидируется DTO.
    const patch: Partial<PanelSettings> = {};
    for (const key of Object.keys(DEFAULTS) as Array<keyof PanelSettings>) {
      const value = (input as any)?.[key];
      if (value === undefined || typeof value !== typeof DEFAULTS[key]) continue;
      if (typeof value === 'string' && value.length > 512) continue;
      (patch as any)[key] = value;
    }
    if (patch.language && !['ru', 'en'].includes(patch.language)) delete patch.language;
    if (patch.theme && !['dark', 'light'].includes(patch.theme)) delete patch.theme;
    const channel = patch.updateChannel ?? current.updateChannel;
    const next: PanelSettings = {
      ...current,
      ...patch,
      rateLimit: Math.min(10000, Math.max(1, Number(patch.rateLimit ?? current.rateLimit))),
      sessionMinutes: Math.min(1440, Math.max(1, Number(patch.sessionMinutes ?? current.sessionMinutes))),
      updateChannel: channel === 'dev' ? 'dev' : 'stable',
      updateCheckEnabled: Boolean(patch.updateCheckEnabled ?? current.updateCheckEnabled),
    };
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2));
    return next;
  }
}
