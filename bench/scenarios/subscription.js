// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
const { BASE_URL, loadContext, run } = require('./common');

module.exports = () => {
  const ctx = loadContext();
  return run('subscription', {
    url: `${BASE_URL}/api/subscriptions/${ctx.subscriptionToken}/json`,
  });
};
