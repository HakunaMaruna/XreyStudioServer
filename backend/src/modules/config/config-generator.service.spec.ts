import { ConfigGeneratorService } from './config-generator.service';

describe('ConfigGeneratorService external protocols', () => {
  const prisma: any = {
    node: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    rule: { findMany: jest.fn() },
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
    service = new ConfigGeneratorService(prisma, {} as any);
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
});
