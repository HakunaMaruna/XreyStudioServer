import { BadRequestException } from '@nestjs/common';
import { createHash, verify as ed25519Verify } from 'crypto';
import { APP_VERSION } from '../../version';

export type PluginManifest = {
  id: string; name: string; version: string; author: string; description: string;
  license: string; minPanelVersion: string; maxPanelVersion?: string | null;
  dependencies: string[]; permissions: string[];
  entrypoints: { backend?: string | null; frontend?: string | null; migrations?: string | null };
  hooks: string[]; settingsSchema: Record<string, unknown>;
  healthcheck?: string | null; i18n?: Record<string, Record<string, string>>;
};

export type PluginPackage = {
  format: 'xss-plugin/1';
  manifest: PluginManifest;
  files: Record<string, string>;
  signature?: { algorithm: 'Ed25519'; signature: string; sha256: string } | null;
};

export const PLUGIN_PERMISSIONS = [
  'users:read', 'subscriptions:write', 'network:outbound', 'settings:write',
  'nodes:read', 'plugins:api',
];
const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const canonicalPayload = (value: Pick<PluginPackage, 'manifest' | 'files'>) =>
  Buffer.from(stableStringify({ manifest: value.manifest, files: value.files }), 'utf8');

export function sha256Package(value: Pick<PluginPackage, 'manifest' | 'files'>) {
  return createHash('sha256').update(canonicalPayload(value)).digest('hex');
}

export function verifyPackageSignature(value: PluginPackage, publicKeyPem: string | undefined, allowUnsigned: boolean) {
  const expected = sha256Package(value);
  if (value.signature?.sha256 && value.signature.sha256 !== expected) {
    throw new BadRequestException('Plugin checksum mismatch');
  }
  if (!value.signature) {
    if (!allowUnsigned) throw new BadRequestException('Plugin package is not signed');
    return false;
  }
  if (value.signature.algorithm !== 'Ed25519') throw new BadRequestException('Unsupported signature algorithm');
  if (!publicKeyPem) throw new BadRequestException('Store public key is not configured');
  // .env often stores PEM with literal "\n" sequences, sometimes mixed with real newlines.
  const pem = publicKeyPem.replace(/\\n/g, '\n').trim();
  let valid = false;
  try {
    valid = ed25519Verify(
      null,
      canonicalPayload(value),
      pem,
      Buffer.from(value.signature.signature, 'base64'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new BadRequestException('Invalid plugin signature');
  return true;
}

function compareVersions(a: string, b: string): number {
  const left = String(a).split('.').map((part) => Number(part) || 0);
  const right = String(b).split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function validatePackage(input: unknown): PluginPackage {
  if (!input || typeof input !== 'object') throw new BadRequestException('Invalid plugin package');
  const value = input as PluginPackage;
  if (value.format !== 'xss-plugin/1') throw new BadRequestException('Unsupported plugin package format');
  const m = value.manifest;
  if (!m || typeof m !== 'object') throw new BadRequestException('Manifest is required');
  if (!ID_RE.test(m.id || '')) throw new BadRequestException('Invalid plugin id');
  if (!SEMVER_RE.test(m.version || '')) throw new BadRequestException('Invalid plugin version');
  if (!m.name || !m.author || !m.description) throw new BadRequestException('Manifest name/author/description are required');
  if (!Array.isArray(m.permissions) || m.permissions.some((p) => !PLUGIN_PERMISSIONS.includes(p))) {
    throw new BadRequestException('Unknown plugin permission');
  }
  if (m.dependencies !== undefined && (!Array.isArray(m.dependencies) || m.dependencies.some((d) => typeof d !== 'string'))) {
    throw new BadRequestException('Invalid plugin dependencies');
  }
  if (m.license !== undefined && typeof m.license !== 'string') throw new BadRequestException('Invalid plugin license');
  if (m.minPanelVersion && compareVersions(m.minPanelVersion, APP_VERSION) > 0) {
    throw new BadRequestException(`Plugin requires panel ${m.minPanelVersion} or newer`);
  }
  if (m.maxPanelVersion && compareVersions(m.maxPanelVersion, APP_VERSION) < 0) {
    throw new BadRequestException(`Plugin requires panel ${m.maxPanelVersion} or older`);
  }
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    throw new BadRequestException('Package files are required');
  }
  const entries = Object.entries(value.files);
  if (!entries.length || entries.length > MAX_FILES) throw new BadRequestException('Invalid file count');
  let total = 0;
  for (const [name, content] of entries) {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
      throw new BadRequestException(`Unsafe plugin path: ${name}`);
    }
    if (typeof content !== 'string') throw new BadRequestException(`Invalid file content: ${name}`);
    const buffer = Buffer.from(content, 'base64');
    total += buffer.byteLength;
    if (total > MAX_FILE_BYTES) throw new BadRequestException('Plugin package is too large');
  }
  if (m.entrypoints?.backend && !value.files[m.entrypoints.backend]) {
    throw new BadRequestException('Backend entrypoint is missing');
  }
  if (m.entrypoints?.migrations) {
    for (const file of ['up.sql', 'down.sql']) {
      const key = `${m.entrypoints.migrations}/${file}`.replace(/^\//, '');
      if (!value.files[key]) throw new BadRequestException(`Migration ${file} is missing`);
    }
  }
  return value;
}
