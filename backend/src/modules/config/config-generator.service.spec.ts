import { ConfigGeneratorService } from './config-generator.service';

describe('ConfigGeneratorService external protocols', () => {
  const prisma: any = {
    node: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    rule: { findMany: jest.fn() },
    routingProfile: { findMany: jest.fn() },
    reverseTunnel: { findMany: jest.fn(async () => []) },
  };
  let service: ConfigGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.node.findUnique.mockResolvedValue({
      id: 'n1',
      inbounds: [
        {
          id: 'i1',
          tag: 'hy',
          protocol: 'hysteria2',
          port: 443,
          settings: {},
          userId: null,
          enabled: true,
        },
        {
          id: 'i2',
          tag: 'vl',
          protocol: 'vless',
          port: 8443,
          settings: {},
          userId: null,
          enabled: true,
        },
      ],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'user@example.com', subscriptionToken: 'token-1' },
    ]);
    prisma.rule.findMany.mockResolvedValue([]);
    prisma.routingProfile.findMany.mockResolvedValue([]);
    service = new ConfigGeneratorService(prisma, {} as any, { emit: jest.fn() } as any, { buildForConfig: jest.fn(async () => ({ outbounds: [], balancers: [], rules: [], observerSelectors: [] })) } as any, { buildForConfig: jest.fn(async () => ({ servers: [] })) } as any);
  });

  it('splits Xray and external protocols into separate engine configs', async () => {
    const { config }: any = await service.generateConfig('n1');
    expect(config.xray.inbounds).toHaveLength(1);
    expect(config.xray.inbounds[0].protocol).toBe('vless');
    expect(config.singbox.inbounds).toHaveLength(1);
    expect(config.singbox.inbounds[0]).toMatchObject({
      type: 'hysteria2',
      tag: 'hy',
      listen_port: 443,
    });
    expect(config.singbox.inbounds[0].users[0].password).toBe('token-1');
    expect(service.validateConfig(config)).toBe(true);
  });

  it('keeps the legacy single-engine format without external inbounds', async () => {
    prisma.node.findUnique.mockResolvedValue({
      id: 'n1',
      inbounds: [
        {
          id: 'i2',
          tag: 'vl',
          protocol: 'vless',
          port: 8443,
          settings: {},
          userId: null,
          enabled: true,
        },
      ],
    });
    const { config }: any = await service.generateConfig('n1');
    expect(config.xray).toBeUndefined();
    expect(config.inbounds).toHaveLength(1);
  });

  it('selects only global and node-tenant rules', async () => {
    prisma.node.findUnique.mockResolvedValue({ id: 'n1', organizationId: 'org-a', inbounds: [] });
    prisma.rule.findMany.mockResolvedValue([
      { payload: { name: 'global' } },
      { payload: { name: 'tenant' } },
    ]);

    const { config }: any = await service.generateConfig('n1');

    expect(prisma.rule.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        OR: [{ organizationId: null }, { organizationId: 'org-a' }],
      },
    });
    expect(config.routing.rules[0]).toEqual({ name: 'global' });
    expect(config.routing.rules[1]).toEqual({ name: 'tenant' });
  });

  it('merges enabled routing profiles into DNS, outbounds and routing rules', async () => {
    prisma.node.findUnique.mockResolvedValue({ id: 'n1', organizationId: 'org-a', inbounds: [] });
    prisma.routingProfile.findMany.mockResolvedValue([
      {
        payload: {
          dnsServers: ['9.9.9.9'],
          outbounds: [{ tag: 'xss-test-direct', protocol: 'freedom' }],
          routingRules: [{ type: 'field', ip: ['10.0.0.0/8'], outboundTag: 'xss-test-direct' }],
        },
      },
    ]);

    const { config }: any = await service.generateConfig('n1');

    expect(prisma.routingProfile.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        OR: [{ organizationId: null }, { organizationId: 'org-a' }],
      },
    });
    expect(config.dns.servers[0]).toBe('9.9.9.9');
    expect(config.outbounds).toContainEqual({ tag: 'xss-test-direct', protocol: 'freedom' });
    expect(config.routing.rules).toContainEqual({
      type: 'field',
      ip: ['10.0.0.0/8'],
      outboundTag: 'xss-test-direct',
    });
    expect(config.routing.rules[config.routing.rules.length - 1]).toEqual({
      type: 'field',
      network: 'tcp,udp',
      outboundTag: 'direct',
    });
  });

  it('emits selfSNI serverName and a decoy fallback for wizard inbounds', async () => {
    prisma.node.findUnique.mockResolvedValue({
      id: 'n1',
      inbounds: [{
        id: 'i3',
        tag: 'wizard-abc123',
        protocol: 'vless',
        transport: 'tcp',
        security: 'tls',
        sni: 'abc123.node.h2onetwork.pro',
        port: 443,
        listen: '0.0.0.0',
        settings: {
          publicHost: 'abc123.node.h2onetwork.pro',
          sni: 'abc123.node.h2onetwork.pro',
          fallbackDest: 18080,
          fallbackAlpn: 'http/1.1',
        },
        userId: null,
        enabled: true,
      }],
    });

    const { config }: any = await service.generateConfig('n1');
    const inbound = config.inbounds[0];
    expect(inbound.streamSettings.security).toBe('tls');
    expect(inbound.streamSettings.tlsSettings.serverName).toBe('abc123.node.h2onetwork.pro');
    expect(inbound.streamSettings.tlsSettings.alpn).toEqual(['http/1.1']);
    expect(inbound.fallback).toEqual([{ dest: 18080, alpn: 'http/1.1', path: undefined }]);
    expect(service.validateConfig(config)).toBe(true);
  });
});
