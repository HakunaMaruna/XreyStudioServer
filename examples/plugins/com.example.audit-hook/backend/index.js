// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
module.exports = {
  async onInstall(sdk) { await sdk.log('info', 'audit hook installed'); },
  async onEnable(sdk) { await sdk.storage.set('enabled', true); },
  async onDisable(sdk) { await sdk.storage.set('enabled', false); },
  async onUninstall(sdk) { await sdk.storage.delete('enabled'); },
  async afterUserUpdate(sdk, ctx) {
    const enabled = await sdk.storage.get('enabled');
    if (!enabled) return;
    const settings = await sdk.settings.get();
    await sdk.log('info', `[${settings.channel || 'audit'}] user updated: ${JSON.stringify(ctx.payload || {}).slice(0, 200)}`);
  },
  async health() { return { ok: true }; },
};
