import { resolveCname } from 'dns/promises';
import { WizardService } from './wizard.service';

jest.mock('dns/promises', () => ({
  resolveCname: jest.fn(async () => ['_acme-challenge.abc123.node.h2onetwork.pro']),
}));
jest.mock('dns', () => ({
  Resolver: jest.fn().mockImplementation(() => ({
    setServers: jest.fn(),
    resolve4: (_host: string, cb: (e: any, a: string[]) => void) => cb(null, ['203.0.113.10']),
  })),
}));

const user = { userId: 'u', email: 'admin@example.com', role: 'ADMIN', organizationId: 'org-1' } as any;
const baseDto = {
  host: '203.0.113.10',
  sshUser: 'root',
  authMode: 'key' as const,
  hostKeyFingerprint: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  location: 'RU',
  privateKey: 'PRIVATE KEY',
};

describe('WizardService', () => {
  let prisma: any;
  let control: any;
  let provision: any;
  let configGenerator: any;
  let agentClient: any;

  beforeEach(() => {
    jest.mocked(resolveCname).mockClear();
    prisma = {
      wizardCredential: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({})), findUnique: jest.fn(async () => null) },
      nodeInstallJob: {
        create: jest.fn(async ({ data }: any) => ({ ...data })),
        update: jest.fn(async ({ data }: any) => data),
        findUnique: jest.fn(async ({ where }: any) => ({ installId: where.installId, status: 'success', stage: 'done', progress: 100, userId: 'u', logs: [] })),
      },
      nodeInstallLog: { create: jest.fn(async ({ data }: any) => data) },
      inbound: { create: jest.fn(async ({ data }: any) => ({ id: 'inbound-1', ...data })) },
      nodeDomain: { findFirst: jest.fn(async () => null) },
      node: {
        findUnique: jest.fn(async () => ({ id: 'node-1', name: 'msk-01', address: '203.0.113.10', organizationId: 'org-1', location: null })),
        update: jest.fn(async ({ data }: any) => data),
      },
    };
    control = {
      allocate: jest.fn(async () => ({ id: 'domain-1', label: 'abc123', fqdn: 'abc123.node.h2onetwork.pro' })),
      release: jest.fn(async () => ({})),
      bindNode: jest.fn(async () => ({})),
      issueCertificate: jest.fn(async () => ({ fqdn: 'abc123.node.h2onetwork.pro', domains: ['abc123.node.h2onetwork.pro'], certificate: 'x', privateKey: 'y' })),
    };
    provision = {
      provision: jest.fn(async () => ({ nodeId: 'node-1', name: 'msk-01', agentToken: 'secret' })),
    };
    configGenerator = { createRevision: jest.fn(async () => ({ version: 3 })) };
    agentClient = { installDecoyCertificate: jest.fn(async () => ({ installed: true })) };
  });

  const service = () => {
    const instance = new WizardService(prisma, control, provision, configGenerator, agentClient);
    // Avoid real DNS lookups in unit tests.
    (instance as any).resolveA = jest.fn(async () => [baseDto.host]);
    return instance;
  };

  it('generates Xray-compatible X25519 keys and a short id', () => {
    const keys = (service() as any).realityKeys();
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(keys.shortId).toMatch(/^[0-9a-f]{16}$/);
    expect(keys.privateKey).not.toBe(keys.publicKey);
  });

  it('stops when the node domain does not resolve to the node IP', async () => {
    const instance = service() as any;
    instance.resolveA = jest.fn(async () => ['198.51.100.9']);
    await expect(instance.create({ ...baseDto } as any, user)).rejects.toThrow('does not point to');
    expect(provision.provision).not.toHaveBeenCalled();
  });

  it('rejects missing secrets before allocating a domain', async () => {
    await expect(service().create({ ...baseDto, authMode: 'password' } as any, user)).rejects.toThrow('Password is required');
    const { privateKey: _ignored, ...withoutKey } = baseDto;
    await expect(service().create({ ...withoutKey, authMode: 'password_key', password: 'pw' } as any, user)).rejects.toThrow('Private key is required');
    expect(control.allocate).not.toHaveBeenCalled();
  });

  it('requires a fingerprint for key auth but not for password-only auth', async () => {
    const { hostKeyFingerprint: _ignored, ...withoutFingerprint } = baseDto;
    await expect(service().create(withoutFingerprint as any, user)).rejects.toThrow('fingerprint is required');
    await expect(service().create({
      ...withoutFingerprint, authMode: 'password', password: 'pw',
    } as any, user)).resolves.toMatchObject({ nodeId: 'node-1' });
    expect(provision.provision).toHaveBeenCalledWith(expect.objectContaining({ hostKeyFingerprint: undefined }), user, expect.any(Function));
  });

  it('records installation progress and logs', async () => {
    const result: any = await service().create({ ...baseDto, installId: 'install-1' } as any, user);
    expect(prisma.nodeInstallJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ installId: 'install-1', status: 'running' }),
    }));
    expect(prisma.nodeInstallLog.create).toHaveBeenCalled();
    expect(prisma.nodeInstallJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'success', progress: 100, nodeId: result.nodeId }),
    }));
    expect(await service().installation('install-1', user)).toMatchObject({ progress: 100 });
  });

  it('creates a node, VLESS Reality inbound and stores encrypted credentials', async () => {
    const result = await service().create({ ...baseDto, userDomain: 'vpn.example.com' } as any, user);
    expect(control.allocate).toHaveBeenCalled();
    expect(provision.provision).toHaveBeenCalledWith(expect.objectContaining({ host: '203.0.113.10', username: 'root' }), user, expect.any(Function));
    expect(prisma.inbound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        protocol: 'vless',
        security: 'reality',
        flow: 'xtls-rprx-vision',
        sni: 'abc123.node.h2onetwork.pro',
        settings: expect.objectContaining({
          sni: 'abc123.node.h2onetwork.pro',
          realityDest: '127.0.0.1:8443',
          realityServerNames: ['abc123.node.h2onetwork.pro'],
          realityPrivateKey: expect.any(String),
          realityPublicKey: expect.any(String),
          realityShortIds: [expect.stringMatching(/^[0-9a-f]{16}$/)],
        }),
      }),
    }));
    const credential = prisma.wizardCredential.create.mock.calls[0][0].data;
    expect(credential.password).toBeNull();
    expect(credential.privateKey).toMatch(/^v1:/);
    expect(credential.privateKey).not.toContain('PRIVATE KEY');
    expect(control.issueCertificate).toHaveBeenCalledWith('domain-1', expect.anything(), ['vpn.example.com']);
    expect(agentClient.installDecoyCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ address: baseDto.host }),
      expect.objectContaining({ hostname: 'abc123.node.h2onetwork.pro' }),
    );
    expect(result).toMatchObject({ nodeId: 'node-1', fqdn: 'abc123.node.h2onetwork.pro', revision: 3, certificateIssued: true });
    expect(result).not.toHaveProperty('agentToken');
  });

  it('skips custom-domain verification and certificate when not requested', async () => {
    await expect(service().create({
      ...baseDto, userDomain: 'vpn.example.com', issueCustomCert: false,
    } as any, user)).resolves.toMatchObject({ nodeId: 'node-1' });
    expect(resolveCname).not.toHaveBeenCalled();
    expect(control.issueCertificate).toHaveBeenCalledWith('domain-1', expect.anything(), []);
  });

  it('releases the domain when the ACME CNAME is missing', async () => {
    jest.mocked(resolveCname).mockRejectedValueOnce(new Error('ENODATA'));
    await expect(service().create({ ...baseDto, userDomain: 'vpn.example.com' } as any, user)).rejects.toThrow('_acme-challenge.vpn.example.com');
    expect(control.release).toHaveBeenCalledWith('domain-1', expect.anything());
    expect(provision.provision).not.toHaveBeenCalled();
  });

  it('releases the domain when SSH provisioning fails', async () => {
    provision.provision.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service().create(baseDto as any, user)).rejects.toThrow('Node installation failed');
    expect(control.release).toHaveBeenCalled();
    expect(prisma.inbound.create).not.toHaveBeenCalled();
  });

  it('returns editable node parameters without secrets', async () => {
    prisma.wizardCredential.findUnique.mockResolvedValueOnce({
      authMode: 'key', sshHost: '203.0.113.10', sshUser: 'root', sshPort: 22,
      location: 'RU', password: 'v1:enc', privateKey: null, passphrase: null,
      userDomain: null, createdAt: new Date(),
    });
    const params = await service().getNodeParams('node-1', user);
    expect(params).toMatchObject({ name: 'msk-01', authMode: 'key', sshUser: 'root', location: 'RU', hasPassword: true });
    expect(JSON.stringify(params)).not.toContain('v1:enc');
  });

  it('updates node fields and rotates secrets in encrypted form', async () => {
    prisma.wizardCredential.upsert = jest.fn(async ({ create }: any) => create);
    prisma.wizardCredential.findUnique.mockResolvedValueOnce(null);
    const result = await service().updateNodeParams('node-1', {
      name: 'msk-renamed', location: 'DE', sshUser: 'deploy', sshPort: 2222, password: 'new-secret',
    } as any, user);
    expect(prisma.node.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'msk-renamed', location: 'DE' }),
    }));
    const upsert = prisma.wizardCredential.upsert.mock.calls[0][0];
    expect(upsert.create.password).toMatch(/^v1:/);
    expect(upsert.create.password).not.toContain('new-secret');
    expect(upsert.create).toMatchObject({ sshUser: 'deploy', sshPort: 2222, location: 'DE' });
    expect(result.name).toBe('msk-01');
  });

  it('blocks editing a node from another organization', async () => {
    prisma.node.findUnique.mockResolvedValueOnce({ id: 'node-1', organizationId: 'org-2' });
    await expect(service().getNodeParams('node-1', { ...user, role: 'OPERATOR', organizationId: 'org-1' })).rejects.toThrow('another organization');
  });

  it('never returns stored secrets when listing credentials', async () => {
    prisma.wizardCredential.findMany.mockResolvedValueOnce([
      { nodeId: 'node-1', authMode: 'key', password: 'v1:enc', privateKey: 'v1:enc', passphrase: null, createdAt: new Date() },
    ]);
    const rows = await service().listCredentials();
    expect(rows[0]).toMatchObject({ hasPassword: true, hasPrivateKey: true, hasPassphrase: false });
    expect(JSON.stringify(rows)).not.toContain('v1:enc');
  });
});
