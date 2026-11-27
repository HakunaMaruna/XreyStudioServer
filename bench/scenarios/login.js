// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
const { BASE_URL, run } = require('./common');

module.exports = () =>
  run('login', {
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.BENCH_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.BENCH_ADMIN_PASSWORD || 'bench-admin-pass-123',
    }),
  });
