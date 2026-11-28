// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
export const APP_VERSION = '2.60.4';

// Агент меняется не в каждом релизе панели: frontend-only и backend-only
// правки не требуют пересборки агента. Порог — последняя версия, в которой
// действительно менялся код агента (agent/src). Более старые агенты помечаем
// устаревшими, более новые и равные — нет.
export const MIN_AGENT_VERSION = '2.60.3';

function versionParts(value: string): number[] | null {
  const core = String(value || '').trim().replace(/^v/i, '').split(/[-+]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map((part) => Number(part));
}

function isBelow(version: string | null | undefined, target: string): boolean {
  if (!version) return false; // учитывается отдельным счётчиком unknown
  const actual = versionParts(version);
  const minimum = versionParts(target);
  if (!actual || !minimum) return true;
  const length = Math.max(actual.length, minimum.length);
  for (let index = 0; index < length; index += 1) {
    const left = actual[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) return left < right;
  }
  return false;
}

/** Агент ниже минимальной совместимой версии — обновление обязательно. */
export function isAgentOutdated(version: string | null | undefined): boolean {
  return isBelow(version, MIN_AGENT_VERSION);
}

/** Агент отстаёт от версии панели — обновление доступно, но не обязательно. */
export function isAgentUpdateAvailable(version: string | null | undefined): boolean {
  return isBelow(version, APP_VERSION);
}
