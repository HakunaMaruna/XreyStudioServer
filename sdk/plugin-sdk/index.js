// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
/**
 * Plugin SDK helpers. The runtime always passes a versioned `sdk` object into hooks;
 * these helpers are for authoring and validation only.
 */
export function definePlugin(plugin) {
  return plugin;
}

export const SDK_VERSION = '1.0';

export function requirePermissions(manifest, permissions) {
  const allowed = new Set(manifest.permissions || []);
  for (const permission of permissions) {
    if (!allowed.has(permission)) throw new Error(`Missing permission: ${permission}`);
  }
}
