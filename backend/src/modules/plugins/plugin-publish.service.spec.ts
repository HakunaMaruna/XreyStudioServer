// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { generateKeyPairSync } from 'crypto';
import { PluginPublishService } from './plugin-publish.service';
import { PluginPackage, reviewPackage, signPackage, verifyPackageSignature } from './plugin-package';

const pkg: PluginPackage = {
  format: 'xss-plugin/1',
  manifest: {
    id: 'com.example.test', name: 'Test', version: '1.0.0', author: 'XreyStudio', description: 'Test plugin',
    license: 'AGPL-3.0', minPanelVersion: '2.38.0', dependencies: [], permissions: ['users:read'],
    entrypoints: { backend: 'backend/index.js' }, hooks: [], settingsSchema: {},
  },
  files: { 'backend/index.js': Buffer.from('module.exports = {};').toString('base64'), 'README.md': Buffer.from('readme').toString('base64') },
  signature: null,
};

describe('plugin publishing', () => {
  it('signs with current and old public key support', () => {
    const current = generateKeyPairSync('ed25519');
    const old = generateKeyPairSync('ed25519');
    const signed = signPackage(pkg, current.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const keys = [
      current.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      old.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    ];
    expect(verifyPackageSignature(signed, keys, false)).toBe(true);
    expect(() => verifyPackageSignature(signed, [keys[1]], false)).toThrow();
  });

  it('blocks direct database access in static review', () => {
    const unsafe: PluginPackage = {
      ...pkg,
      files: { ...pkg.files, 'backend/index.js': Buffer.from("require('@prisma/client')").toString('base64') },
    };
    expect(reviewPackage(unsafe).some((item) => item.level === 'blocking')).toBe(true);
  });

  it('allows a clean package through static review', () => {
    expect(reviewPackage(pkg).some((item) => item.level === 'blocking')).toBe(false);
  });
});
