import { ConfigGeneratorService } from '../src/modules/config/config-generator.service';

/**
 * QA v2.15 issue 125: regression coverage for the Xray per-user stats fix and for
 * the generated Reality / VMess inbound shapes. Unit-level: only the Prisma
 * delegate is mocked, the generator itself is the real production code.
 */
describe('ConfigGeneratorService: Xray stats, Reality and VMess (QA v2.15)', () => {
  const prisma: any = {
    node: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    rule: { findMany: jest.fn() },
    configProfile: { findMany: jest.fn().mockResolvedValue([]) },
  };
  let service: ConfigGeneratorService;
  const savedStatsEnabled = process.env.XRAY_STATS_ENABLED;
  const savedApiPort = process.env.XRAY_API_PORT;
  const TEST_REALITY_PRIVATE_KEY =
    process.env.TEST_REALITY_PRIVATE_KEY || 'test-only-reality-key-not-a-secret';

  const realityNode = () => ({
    id: 'n1',
    address: '127.0.0.1',
    organizationId: null,
    config: {
      reality: {
        privateKey: TEST_REALITY_PRIVATE_KEY,
        serverNames: ['example.com', 'www.example.com'],
        shortIds: ['abc123', 'def456'],
      },
    },
    inbounds: [
        {
          id: 'in-reality',
          tag: 'in-reality',
          port: 443,
          protocol: 'vless',
          security: 'reality',
          transport: 'raw',
          flow: 'xtls-rprx-vision',
          settings: {
            flow: 'xtls-rprx-vision',
            realityPrivateKey: TEST_REALITY_PRIVATE_KEY,
            realityServerNames: ['example.com', 'www.example.com'],
            realityShortIds: ['abc123', 'def456'],
          },
          clients: [],
        },
        {
          id: 'in-vmess',
          tag: 'in-vmess',
          port: 8443,
          protocol: 'vmess',
          security: 'none',
          transport: 'ws',
          settings: {},
          clients: [],
        },
    ],
  });

  beforeAll(() => {
    savedStatsEnabled === undefined
      ? delete process.env.XRAY_STATS_ENABLED
      : (process.env.XRAY_STATS_ENABLED = savedStatsEnabled);
  });

  afterAll(() => {
    if (savedStatsEnabled === undefined) delete process.env.XRAY_STATS_ENABLED;
    else process.env.XRAY_STATS_ENABLED = savedStatsEnabled;
    if (savedApiPort === undefined) delete process.env.XRAY_API_PORT;
    else process.env.XRAY_API_PORT = savedApiPort;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.XRAY_STATS_ENABLED;
    delete process.env.XRAY_API_PORT;
    (prisma.configProfile.findMany as jest.Mock).mockResolvedValue([]);
    prisma.node.findUnique.mockResolvedValue(realityNode());
    prisma.user.findMany.mockResolvedValue([]);
    prisma.rule.findMany.mockResolvedValue([]);
    service = new ConfigGeneratorService(prisma, {} as any);
  });

  const generate = async (): Promise<any> => (await service.generateConfig('n1')).config;

  it('enables statsUser* and adds api-in only when XRAY_STATS_ENABLED=true', async () => {
    const withoutStats = await generate();
    expect(withoutStats.policy.levels['0'].statsUserUplink).toBe(true);
    expect(withoutStats.policy.levels['0'].statsUserDownlink).toBe(true);
    expect(withoutStats.inbounds.some((inbound: any) => inbound.tag === 'api-in')).toBe(false);
    expect(withoutStats.api).toBeUndefined();

    process.env.XRAY_STATS_ENABLED = 'true';
    const withStats = await generate();
    expect(withStats.policy.levels['0'].statsUserUplink).toBe(true);
    expect(withStats.policy.levels['0'].statsUserDownlink).toBe(true);
    expect(withStats.api).toEqual({ tag: 'api', services: ['HandlerService', 'StatsService'] });
    expect(withStats.inbounds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: 'api-in',
          listen: '127.0.0.1',
          port: 8080,
          protocol: 'dokodemo-door',
          settings: { address: '127.0.0.1', port: 8080, network: 'tcp' },
        }),
      ]),
    );
    expect(withStats.routing.rules[0]).toEqual({
      type: 'field',
      inboundTag: ['api-in'],
      outboundTag: 'api',
    });
  });

  it('honours XRAY_API_PORT for the stats inbound', async () => {
    process.env.XRAY_STATS_ENABLED = 'true';
    process.env.XRAY_API_PORT = '9099';
    const config = await generate();
    const apiIn = config.inbounds.find((inbound: any) => inbound.tag === 'api-in');
    expect(apiIn.port).toBe(9099);
    expect(apiIn.settings).toEqual({ address: '127.0.0.1', port: 9099, network: 'tcp' });
  });

  it('generates a VLESS Reality inbound with privateKey, serverNames, shortIds and client flow', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', subscriptionToken: 'token-u1', trafficUsed: 0n, configProfileId: null },
    ]);
    const config = await generate();
    const reality = config.inbounds.find((inbound: any) => inbound.tag === 'in-reality');

    expect(reality).toMatchObject({
      protocol: 'vless',
      port: 443,
      settings: {
        decryption: 'none',
        clients: [{ id: 'u1', email: 'u1@example.com', flow: 'xtls-rprx-vision' }],
        flow: 'xtls-rprx-vision',
      },
      streamSettings: {
        network: 'raw',
        security: 'reality',
        flow: 'xtls-rprx-vision',
        realitySettings: {
          show: false,
          dest: 'www.microsoft.com:443',
          serverNames: ['example.com', 'www.example.com'],
          privateKey: TEST_REALITY_PRIVATE_KEY,
          shortIds: ['abc123', 'def456'],
          spiderX: '/',
        },
      },
    });
  });

  it('generates a VMess inbound with clients only for active users', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'u1@example.com',
        subscriptionToken: 'token-u1',
        trafficUsed: 0n,
        configProfileId: null,
      },
    ]);
    const config = await generate();
    const vmess = config.inbounds.find((inbound: any) => inbound.tag === 'in-vmess');
    expect(vmess).toMatchObject({
      protocol: 'vmess',
      port: 8443,
      settings: { clients: [{ id: 'u1', email: 'u1@example.com', alterId: 0 }] },
      streamSettings: { network: 'ws', security: 'none' },
    });
  });

  it('drops an inbound client when its per-client traffic limit is exhausted', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'u1@example.com',
        subscriptionToken: 'token-u1',
        trafficUsed: 1000n,
        configProfileId: null,
      },
    ]);
    const node = realityNode();
    node.inbounds[1].clients = [{ userId: 'u1', enabled: true, trafficLimit: 500n }];
    prisma.node.findUnique.mockResolvedValue(node);

    const config = await generate();
    const vmess = config.inbounds.find((inbound: any) => inbound.tag === 'in-vmess');
    expect(vmess.settings.clients).toEqual([]);
  });

  it('applies config-profile routing rules, DNS servers and outbounds', async () => {
    prisma.configProfile.findMany.mockResolvedValue([
      {
        id: 'p1',
        payload: {
          routingRules: [{ type: 'field', inboundTag: ['profile-in'], outboundTag: 'blocked' }],
          dnsServers: ['9.9.9.9'],
          outbounds: [{ tag: 'profile-out', protocol: 'freedom' }],
        },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'u1@example.com',
        subscriptionToken: 'token-u1',
        trafficUsed: 0n,
        configProfileId: 'p1',
      },
    ]);

    const config = await generate();
    expect(config.routing.rules).toEqual(
      expect.arrayContaining([{ type: 'field', inboundTag: ['profile-in'], outboundTag: 'blocked' }]),
    );
    expect(config.dns.servers).toContain('9.9.9.9');
    expect(config.outbounds).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: 'profile-out', protocol: 'freedom' })]),
    );
  });
});
