import { ConfigGeneratorService } from './config-generator.service';

describe('ConfigGeneratorService IPv6 exit control', () => {
  it('forces IPv4 DNS and blocks IPv6 destinations when client IPv6 is disabled', async () => {
    const previous = process.env.XRAY_STATS_ENABLED;
    process.env.XRAY_STATS_ENABLED = 'false';
    const prisma: any = {
      node: { findUnique: jest.fn(async () => ({ id: 'n1', inbounds: [], organizationId: null, clientIpv6Enabled: false })) },
      user: { findMany: jest.fn(async () => []) },
      rule: { findMany: jest.fn(async () => []) },
      routingProfile: { findMany: jest.fn(async () => []) },
      reverseTunnel: { findMany: jest.fn(async () => []) },
      proxyChainHop: { findMany: jest.fn(async () => []) },
      dnsProfile: { findMany: jest.fn(async () => []) },
      configProfile: { findMany: jest.fn(async () => []) },
      balancer: { findMany: jest.fn(async () => []) },
    };
    const service = new ConfigGeneratorService(prisma, {} as any, { emit: jest.fn() } as any,
      { buildForConfig: jest.fn(async () => ({ outbounds: [], balancers: [], rules: [], observerSelectors: [] })) } as any,
      { buildForConfig: jest.fn(async () => ({ servers: [] })) } as any);
    const { config }: any = await service.generateConfig('n1');
    expect(config.dns.queryStrategy).toBe('UseIPv4');
    expect(config.routing.rules).toContainEqual({ type: 'field', ip: ['::/0'], outboundTag: 'blocked' });
    if (previous === undefined) delete process.env.XRAY_STATS_ENABLED;
    else process.env.XRAY_STATS_ENABLED = previous;
  });
});
