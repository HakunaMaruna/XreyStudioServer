// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/middleware.ts'), 'utf8');

const failures = [];
if (source.includes('/api/subscriptions${pathname}')) {
  failures.push('legacy rewrite keeps the /sub prefix: /api/subscriptions${pathname}');
}
if (!source.includes('/api/subscriptions/${match[1]}')) {
  failures.push('rewrite must target /api/subscriptions/<token>');
}
if (!source.includes('/^\\/sub\\/([A-Za-z0-9_-]+)\\/?$/')) {
  failures.push('token segment validation is missing');
}

if (failures.length) {
  console.error('subscription rewrite check failed:', failures.join('; '));
  process.exit(1);
}
console.log('subscription rewrite check: OK');
