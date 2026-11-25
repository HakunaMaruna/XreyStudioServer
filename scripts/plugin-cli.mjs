#!/usr/bin/env node
// No external dependencies. Usage:
//   node scripts/plugin-cli.mjs create <dir> <id> <name>
//   node scripts/plugin-cli.mjs keygen <private.pem> <public.pem>
//   node scripts/plugin-cli.mjs pack <dir> <out.json> [private.pem]
import { promises as fs } from 'fs';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import * as path from 'path';

const [command, ...args] = process.argv.slice(2);

async function walk(dir, root = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = {};
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, await walk(full, root));
    else files[path.relative(root, full).split(path.sep).join('/')] = (await fs.readFile(full)).toString('base64');
  }
  return files;
}

async function create() {
  const [dir, id, name] = args;
  if (!dir || !id || !name) throw new Error('create <dir> <id> <name>');
  const manifest = {
    id, name, version: '1.0.0', author: 'Developer', description: `${name} plugin`,
    license: 'MIT', minPanelVersion: '2.38.0', maxPanelVersion: null,
    dependencies: [], permissions: ['users:read'],
    entrypoints: { backend: 'backend/index.js', frontend: null, migrations: 'migrations' },
    hooks: ['onInstall', 'onEnable', 'onDisable', 'onUninstall'],
    settingsSchema: { type: 'object', properties: { greeting: { type: 'string', title: 'Greeting' } } },
    healthcheck: 'health', i18n: { ru: { title: name }, en: { title: name } },
  };
  await fs.mkdir(path.join(dir, 'backend'), { recursive: true });
  await fs.mkdir(path.join(dir, 'migrations'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(dir, 'backend/index.js'), `module.exports = {
  async onInstall(sdk) { await sdk.log('info', 'installed'); },
  async onEnable(sdk) { await sdk.storage.set('enabled', true); },
  async onDisable(sdk) { await sdk.storage.set('enabled', false); },
  async onUninstall(sdk) { await sdk.storage.delete('enabled'); },
  async health(sdk) { return { ok: true }; },
  async dashboardWidget(sdk) { const settings = await sdk.settings.get(); return { title: ${JSON.stringify(name)}, greeting: settings.greeting || 'Hello' }; },
};\n`);
  await fs.writeFile(path.join(dir, 'migrations/up.sql'), `-- up migration for ${id}\n`);
  await fs.writeFile(path.join(dir, 'migrations/down.sql'), `-- down migration for ${id}\n`);
  await fs.writeFile(path.join(dir, 'README.md'), `# ${name}\n\nGenerated plugin template.\n`);
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), `# Changelog\n\n## 1.0.0\n- Initial release\n`);
  console.log(`Created plugin template in ${dir}`);
}

function keygen() {
  const [privatePath, publicPath] = args;
  if (!privatePath || !publicPath) throw new Error('keygen <private.pem> <public.pem>');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  fs.writeFile(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFile(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Generated ${privatePath} and ${publicPath}`);
}

async function pack() {
  const [dir, out, privatePath] = args;
  if (!dir || !out) throw new Error('pack <dir> <out.json> [private.pem]');
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'plugin.json'), 'utf8'));
  const files = await walk(dir);
  delete files['plugin.json'];
  const stable = (value) => {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};
  const payload = Buffer.from(stable({ manifest, files }));
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const pkg = { format: 'xss-plugin/1', manifest, files, signature: null };
  if (privatePath) {
    const privateKey = await fs.readFile(privatePath, 'utf8');
    pkg.signature = {
      algorithm: 'Ed25519',
      signature: sign(null, payload, privateKey).toString('base64'),
      sha256,
    };
  }
  await fs.writeFile(out, JSON.stringify(pkg, null, 2));
  console.log(`Packed ${manifest.id}@${manifest.version} → ${out} (${sha256})`);
}

if (command === 'create') await create();
else if (command === 'keygen') keygen();
else if (command === 'pack') await pack();
else {
  console.log('Usage: plugin-cli.mjs create|keygen|pack ...');
  process.exit(1);
}
