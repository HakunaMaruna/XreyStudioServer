// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
module.exports = {
  async onInstall(sdk) { await sdk.log('info', 'installed'); },
  async onEnable(sdk) { await sdk.storage.set('enabled', true); },
  async onDisable(sdk) { await sdk.storage.set('enabled', false); },
  async onUninstall(sdk) { await sdk.storage.delete('enabled'); },
  async health(sdk) { return { ok: true }; },
  async dashboardWidget(sdk) { const settings = await sdk.settings.get(); return { title: "Hello Widget", greeting: settings.greeting || 'Hello' }; },
};
