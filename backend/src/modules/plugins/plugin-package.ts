// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { createHash, sign as ed25519Sign, verify as ed25519Verify } from 'crypto';
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

function keyList(value?: string | string[]): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.replace(/\\n/g, '\n').trim())
    .filter(Boolean);
}

/** Accepts a single PEM, a comma-separated list, or an array (current + previous keys). */
export function verifyPackageSignature(value: PluginPackage, publicKeys: string | string[] | undefined, allowUnsigned: boolean) {
  const expected = sha256Package(value);
  if (value.signature?.sha256 && value.signature.sha256 !== expected) {
    throw new BadRequestException('Plugin checksum mismatch');
  }
  if (!value.signature) {
    if (!allowUnsigned) throw new BadRequestException('Plugin package is not signed');
    return false;
  }
  if (value.signature.algorithm !== 'Ed25519') throw new BadRequestException('Unsupported signature algorithm');
  const pems = keyList(publicKeys);
  if (!pems.length) throw new BadRequestException('Store public key is not configured');
  const signature = Buffer.from(value.signature.signature, 'base64');
  const payload = canonicalPayload(value);
  const valid = pems.some((pem) => {
    try { return ed25519Verify(null, payload, pem, signature); } catch { return false; }
  });
  if (!valid) throw new BadRequestException('Invalid plugin signature');
  return true;
}

/** Server-side signing used by the App Store upload flow. */
export function signPackage(value: PluginPackage, privateKeyPem: string): PluginPackage {
  const pem = privateKeyPem.replace(/\\n/g, '\n').trim();
  const signature = ed25519Sign(null, canonicalPayload(value), pem).toString('base64');
  return { ...value, signature: { algorithm: 'Ed25519', signature, sha256: sha256Package(value) } };
}

export type ReviewFinding = { level: 'blocking' | 'warning' | 'info'; code: string; message: string };

/** Static review before a package enters moderation. Blocks obviously unsafe code. */
export function reviewPackage(value: PluginPackage): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const m = value.manifest;
  const files = Object.entries(value.files);
  const decoded = files.map(([name, content]) => {
    try { return { name, text: Buffer.from(content, 'base64').toString('utf8') }; }
    catch { return { name, text: '' }; }
  });
  const forbidden: Array<[RegExp, string]> = [
    [/@prisma\/client|from ['"]prisma|require\(['"]prisma/, 'direct database access'],
    [/process\.env/, 'direct environment access'],
    [/child_process|node:child_process/, 'process spawning'],
    [/\beval\s*\(|new Function\s*\(/, 'dynamic code execution'],
    [/\bfetch\s*\(|require\(['"]https?['"]\)|from ['"]https?['"]/, 'direct network access (use SDK http.request)'],
    [/\bfs\b.*(readFile|writeFile|readFileSync|writeFileSync)/, 'direct filesystem access'],
  ];
  for (const { name, text } of decoded) {
    for (const [pattern, reason] of forbidden) {
      if (pattern.test(text)) findings.push({ level: 'blocking', code: 'forbidden-api', message: `${name}: ${reason}` });
    }
  }
  if (!findings.some((item) => item.code === 'forbidden-api')) {
    findings.push({ level: 'info', code: 'static-clean', message: 'No forbidden direct APIs found' });
  }
  if (!files.some(([name]) => name === 'README.md')) findings.push({ level: 'warning', code: 'readme', message: 'README.md is missing' });
  if (!files.some(([name]) => name === 'CHANGELOG.md')) findings.push({ level: 'warning', code: 'changelog', message: 'CHANGELOG.md is missing' });
  if (!m.license) findings.push({ level: 'warning', code: 'license', message: 'License is not declared' });
  if (m.permissions.length > 3) findings.push({ level: 'warning', code: 'permissions', message: `${m.permissions.length} permissions requested — review manually` });
  if (m.entrypoints.migrations) findings.push({ level: 'warning', code: 'migrations', message: 'Package contains SQL migrations — review manually' });
  return findings;
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
