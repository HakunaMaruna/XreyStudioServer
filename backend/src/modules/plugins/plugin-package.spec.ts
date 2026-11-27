// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import {
  PluginPackage, sha256Package, stableStringify, validatePackage, verifyPackageSignature,
} from './plugin-package';

const basePackage = (): PluginPackage => ({
  format: 'xss-plugin/1',
  manifest: {
    id: 'com.example.test', name: 'Test', version: '1.0.0', author: 'A', description: 'D',
    license: 'MIT', minPanelVersion: '2.38.0', maxPanelVersion: null, dependencies: [],
    permissions: ['users:read'],
    entrypoints: { backend: 'backend/index.js', frontend: null, migrations: null },
    hooks: ['onEnable'], settingsSchema: {}, healthcheck: 'health', i18n: {},
  },
  files: { 'backend/index.js': Buffer.from('module.exports = {}').toString('base64') },
  signature: null,
});

describe('plugin package', () => {
  it('validates a correct package', () => {
    expect(validatePackage(basePackage()).manifest.id).toBe('com.example.test');
  });

  it('rejects traversal, oversized archives and unknown permissions', () => {
    const traversal = basePackage();
    traversal.files['../evil.js'] = Buffer.from('x').toString('base64');
    expect(() => validatePackage(traversal)).toThrow(BadRequestException);
    const unknown = basePackage();
    unknown.manifest.permissions = ['root:all'];
    expect(() => validatePackage(unknown)).toThrow('Unknown plugin permission');
  });

  it('verifies Ed25519 signatures and rejects tampering', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pkg = basePackage();
    const payload = Buffer.from(stableStringify({ manifest: pkg.manifest, files: pkg.files }));
    pkg.signature = {
      algorithm: 'Ed25519',
      signature: sign(null, payload, privateKey).toString('base64'),
      sha256: sha256Package(pkg),
    };
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyPackageSignature(pkg, pem, false)).toBe(true);
    pkg.files['backend/index.js'] = Buffer.from('tampered').toString('base64');
    expect(() => verifyPackageSignature(pkg, pem, false)).toThrow('checksum mismatch');
    expect(() => verifyPackageSignature(basePackage(), pem, false)).toThrow('not signed');
  });
});
