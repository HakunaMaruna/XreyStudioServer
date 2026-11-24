import { ServiceUnavailableException } from '@nestjs/common';
import { NodeProvisionService, fingerprintMatches } from './node-provision.service';
import { createHash } from 'crypto';

const dto = {
  name: 'edge-1',
  host: '203.0.113.10',
  port: 22,
  username: 'root',
  privateKey: 'dummy',
  hostKeyFingerprint: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};

describe('NodeProvisionService', () => {
  const original = process.env.SSH_PROVISION_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SSH_PROVISION_ENABLED;
    else process.env.SSH_PROVISION_ENABLED = original;
  });

  it('is disabled unless explicitly enabled', async () => {
    delete process.env.SSH_PROVISION_ENABLED;
    const service = new NodeProvisionService({} as never);
    await expect(service.provision(dto as never, { role: 'ADMIN' } as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('verifies the exact host key fingerprint', () => {
    const key = Buffer.from('ssh-host-key');
    const fp = `SHA256:${createHash('sha256').update(key).digest('base64')}`;
    expect(fingerprintMatches(key, fp)).toBe(true);
    expect(fingerprintMatches(key, 'SHA256:' + 'A'.repeat(43) + '=')).toBe(false);
  });
});
