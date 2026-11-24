import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/vendor');
mkdirSync(out, { recursive: true });

const css = resolve(root, 'node_modules/@adminlte/react/dist/css/adminlte.css');
if (existsSync(css)) cpSync(css, resolve(out, 'adminlte.css'));

const icons = resolve(root, 'node_modules/bootstrap-icons/font');
if (existsSync(icons)) {
  mkdirSync(resolve(out, 'bootstrap-icons'), { recursive: true });
  cpSync(icons, resolve(out, 'bootstrap-icons'), { recursive: true });
}

const bootstrapJs = resolve(root, 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js');
if (existsSync(bootstrapJs)) cpSync(bootstrapJs, resolve(out, 'bootstrap.bundle.min.js'));

console.log('AdminLTE assets copied to public/vendor');
