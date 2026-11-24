import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import { UpdatesService } from './updates.service';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('UpdatesService', () => {
  const service = new UpdatesService();
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
