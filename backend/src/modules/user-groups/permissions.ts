// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'xss:required-permission';
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export const PERMISSION_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Пользователи',
    keys: ['users.view', 'users.create', 'users.edit', 'users.delete', 'users.export'],
  },
  {
    title: 'Подключения',
    keys: ['inbounds.view', 'inbounds.create', 'inbounds.edit', 'inbounds.delete'],
  },
  {
    title: 'Хосты и правила',
    keys: ['hosts.view', 'hosts.create', 'hosts.edit', 'hosts.delete', 'rules.view', 'rules.create', 'rules.edit', 'rules.delete'],
  },
  {
    title: 'Ноды',
    keys: ['nodes.view', 'nodes.apply', 'nodes.restart', 'nodes.update'],
  },
  {
    title: 'Система',
    keys: ['settings.view', 'settings.edit', 'billing.view', 'billing.edit', 'plugins.view', 'plugins.install', 'telemetry.view', 'audit.view'],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.keys);

export const MODERATOR_PERMISSIONS = [
  'users.view', 'users.edit',
  'inbounds.view', 'inbounds.create', 'inbounds.edit', 'inbounds.delete',
  'hosts.view', 'hosts.create', 'hosts.edit', 'hosts.delete',
  'rules.view', 'rules.create', 'rules.edit', 'rules.delete',
  'nodes.view', 'nodes.apply',
];
