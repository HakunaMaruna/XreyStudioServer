// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
const { BASE_URL, loadContext, run } = require('./common');

module.exports = () => {
  const ctx = loadContext();
  return run('users', {
    url: `${BASE_URL}/api/users?page=1&limit=50&sortBy=createdAt&sortOrder=desc`,
    headers: { authorization: `Bearer ${ctx.accessToken}` },
  });
};
