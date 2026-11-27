// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const target = resolve(root, 'src/lib/version.ts');
const content = `// SPDX-License-Identifier: AGPL-3.0-or-later\n// Copyright (C) 2026 HakunaMaruna\n// Синхронизируется из package.json скриптом prebuild — не редактируйте вручную.\nexport const APP_VERSION = '${version}';\n`;
writeFileSync(target, content);
console.log(`APP_VERSION = ${version}`);
