import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import {
  compareVersions,
  isNewerVersion,
  normalizeVersion,
  parseGithubRelease,
  UpdatesService,
} from './updates.service';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('UpdatesService', () => {
  // verify() не трогает зависимости — для него достаточно заглушек.
  const service = new UpdatesService({} as any, {} as any);
  const originalKey = process.env.UPDATE_PUBLIC_KEY;

  beforeEach(() => {
    process.env.UPDATE_PUBLIC_KEY = publicPem;
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.UPDATE_PUBLIC_KEY;
    else process.env.UPDATE_PUBLIC_KEY = originalKey;
  });

  it('accepts a correctly signed bundle', () => {
    const bundle = Buffer.from('release-bundle');
    const signature = sign(null, bundle, privatePem).toString('base64');
    expect(service.verify({ bundleBase64: bundle.toString('base64'), signatureBase64: signature, version: 'v2.23.3' }))
      .toEqual({ valid: true, version: 'v2.23.3' });
  });

  it('rejects a tampered bundle', () => {
    const signature = sign(null, Buffer.from('original'), privatePem).toString('base64');
    expect(service.verify({ bundleBase64: Buffer.from('tampered').toString('base64'), signatureBase64: signature }).valid)
      .toBe(false);
  });

  it('rejects an empty bundle', () => {
    expect(() => service.verify({ bundleBase64: '', signatureBase64: 'AAAA' })).toThrow(BadRequestException);
  });

  it('fails closed when the public key is missing', () => {
    delete process.env.UPDATE_PUBLIC_KEY;
    const signature = sign(null, Buffer.from('x'), privatePem).toString('base64');
    expect(() => service.verify({ bundleBase64: Buffer.from('x').toString('base64'), signatureBase64: signature }))
      .toThrow(ServiceUnavailableException);
  });
});

describe('version helpers', () => {
  it('normalizes tags and rejects non-semver input', () => {
    expect(normalizeVersion('v2.32.0')).toBe('2.32.0');
    expect(normalizeVersion('2.32.0')).toBe('2.32.0');
    expect(normalizeVersion('nightly')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
  });

  it('compares numeric segments, not strings', () => {
    expect(compareVersions('2.9.0', '2.10.0')).toBe(-1);
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1);
    expect(compareVersions('v2.32.0', '2.32.0')).toBe(0);
    expect(compareVersions('2.32.1', '2.32.0')).toBe(1);
  });

  it('treats a pre-release as older than the release', () => {
    expect(compareVersions('2.33.0-rc.1', '2.33.0')).toBe(-1);
    expect(compareVersions('2.33.0', '2.33.0-rc.1')).toBe(1);
  });

  it('only reports strictly newer versions', () => {
    expect(isNewerVersion('v2.33.0', '2.32.0')).toBe(true);
    expect(isNewerVersion('2.32.0', '2.32.0')).toBe(false);
    expect(isNewerVersion('2.31.9', '2.32.0')).toBe(false);
    expect(isNewerVersion('', '2.32.0')).toBe(false);
  });

  it('parses a GitHub release payload', () => {
    expect(
      parseGithubRelease({
        tag_name: 'v2.33.0',
        html_url: 'https://example.com/release',
        body: 'notes',
        published_at: '2026-11-20T10:00:00Z',
      }),
    ).toEqual({
      version: '2.33.0',
      url: 'https://example.com/release',
      notes: 'notes',
      publishedAt: '2026-11-20T10:00:00Z',
    });
    expect(parseGithubRelease({ name: 'no version here' })).toBeNull();
    expect(parseGithubRelease(null)).toBeNull();
  });
});
