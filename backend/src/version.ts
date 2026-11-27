// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
export const APP_VERSION = '2.51.2';

// Панель и агент релизятся вместе, поэтому устаревший агент — тот, чья версия
// не совпадает с версией панели.
export function isAgentOutdated(version: string | null | undefined): boolean {
  return Boolean(version && version !== APP_VERSION);
}
