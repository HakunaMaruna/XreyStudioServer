import { ConfigGeneratorService } from './config-generator.service';

describe('ConfigGeneratorService traffic stats', () => {
  it('enables the top-level stats object when XRAY_STATS_ENABLED is true', async () => {
    const previous = process.env.XRAY_STATS_ENABLED;
    process.env.XRAY_STATS_ENABLED = 'true';
    const prisma: any = {
      node: { findUnique: jest.fn(async () => ({ id: 'n1', inbounds: [], organizationId: null })) },
      user: { findMany: jest.fn(async () => []) },
      rule: { findMany: jest.fn(async () => []) },
      routingProfile: { findMany: jest.fn(async () => []) },
      reverseTunnel: { findMany: jest.fn(async () => []) },
      proxyChainHop: { findMany: jest.fn(async () => []) },
      dnsProfile: { findMany: jest.fn(async () => []) },
      configProfile: { findMany: jest.fn(async () => []) },
      balancer: { findMany: jest.fn(async () => []) },
    };
    const service = new ConfigGeneratorService(prisma, {} as any, { emit: jest.fn() } as any, { buildForConfig: jest.fn(async () => ({ outbounds: [], balancers: [], rules: [], observerSelectors: [] })) } as any, { buildForConfig: jest.fn(async () => ({ servers: [], rules: [] })) } as any);
    const { config }: any = await service.generateConfig('n1');
    expect(config.stats).toEqual({});
    expect(config.api.tag).toBe('api');
    if (previous === undefined) delete process.env.XRAY_STATS_ENABLED;
    else process.env.XRAY_STATS_ENABLED = previous;
  });
});
