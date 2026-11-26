import { ChainsService } from './chains.service';

const admin = { userId: 'u', email: 'a@b.c', role: 'ADMIN' } as any;

describe('ChainsService', () => {
  let prisma: any;
  let agent: any;
  let service: ChainsService;

  beforeEach(() => {
    const node = (id: string) => ({ id, name: id, address: `10.0.0.${id.slice(-1)}`, status: 'ONLINE' });
    prisma = {
      proxyChain: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async ({ where }: any) => where.id === 'c1' ? {
          id: 'c1', name: 'Chain', status: 'active', routingMode: 'all',
          hops: [
            { id: 'h0', role: 'entry', nodeId: 'n1', port: 10000, node: node('n1') },
            { id: 'h1', role: 'exit', nodeId: 'n2', port: 443, priority: 0, node: node('n2'), publicKey: 'pbk', shortId: 'sid', sni: 'n2.example' },
          ],
          bindings: [],
        } : null),
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data, hops: (data.hops?.create || []).map((hop: any, i: number) => ({ id: `h${i}`, ...hop })) })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
      proxyChainHop: {
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: any) => ({ id: 'h2', ...data })),
      },
      chainBinding: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        upsert: jest.fn(async ({ create }: any) => ({ id: 'b1', ...create })),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      node: {
        findFirst: jest.fn(async ({ where }: any) => node(where.id)),
        findUnique: jest.fn(async ({ where }: any) => node(where.id)),
      },
      nodeDomain: { findFirst: jest.fn(async () => ({ fqdn: 'n2.example' })) },
      inbound: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data })),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      inboundClient: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn(async () => ({ count: 0 })) },
      user: { findMany: jest.fn(async () => []) },
    };
    agent = {
      applyRelays: jest.fn(async () => ({ applied: true })),
      relayStatus: jest.fn(async () => ({ relays: [] })),
      applyConfig: jest.fn(async () => ({ applied: true })),
      ping: jest.fn(async () => ({ reachable: true })),
    };
    service = new ChainsService(prisma, agent);
  });

  const dto = { name: 'Test', entryNodeId: 'n1', exits: [{ nodeId: 'n2', port: 443 }], routingMode: 'all' as const };

  it('creates a chain with an entry relay and exit inbound', async () => {
    const row: any = await service.create(dto, admin);
    expect(row.name).toBe('Test');
    expect(row.entryPort).toEqual(expect.any(Number));
    expect(prisma.inbound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ protocol: 'vless', security: 'reality', port: 443 }),
    }));
  });

  it('rejects entry == exit', async () => {
    await expect(service.create({ ...dto, exits: [{ nodeId: 'n1' }] }, admin)).rejects.toThrow('same node');
  });

  it('binds and unbinds a user', async () => {
    await service.bind('c1', { userId: 'user-1' }, admin);
    expect(prisma.chainBinding.upsert).toHaveBeenCalled();
    prisma.chainBinding.findFirst.mockResolvedValueOnce({ id: 'b1', chainId: 'c1' });
    await service.unbind('c1', 'b1', admin);
    expect(prisma.chainBinding.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });

  it('applies relays and rolls back on agent failure', async () => {
    agent.applyRelays.mockRejectedValueOnce(new Error('boom'));
    await expect(service.apply('c1', admin)).rejects.toThrow('rolled back');
    expect(agent.applyRelays).toHaveBeenCalledTimes(2);
  });

  it('returns chain servers for a bound user', async () => {
    prisma.chainBinding.findFirst.mockResolvedValueOnce({
      id: 'b1', chainId: 'c1', userId: 'user-1',
      chain: { id: 'c1', status: 'active', hops: [
        { role: 'entry', nodeId: 'n1', port: 10000, sni: 'n1.example' },
        { role: 'exit', nodeId: 'n2', port: 443, publicKey: 'pbk', shortId: 'sid', sni: 'n2.example', priority: 0, enabled: true },
      ] },
    });
    prisma.proxyChain.findUnique.mockResolvedValueOnce({
      id: 'c1', status: 'active',
      hops: [
        { role: 'entry', nodeId: 'n1', port: 10000, sni: 'n1.example' },
        { role: 'exit', nodeId: 'n2', port: 443, publicKey: 'pbk', shortId: 'sid', sni: 'n2.example', priority: 0, enabled: true, node: { name: 'n2' } },
      ],
    });
    const servers = await service.subscriptionServers('user-1');
    expect(servers).toEqual([expect.objectContaining({ host: 'n1.example', port: 10000, publicKey: 'pbk' })]);
  });

  it('applies reverse bridge relays on entry and exit nodes', async () => {
    prisma.proxyChain.findFirst.mockResolvedValueOnce({
      id: 'c1', name: 'Bridge', status: 'active', routingMode: 'all', bridgeMode: 'bridge',
      hops: [
        { id: 'h0', role: 'entry', nodeId: 'n1', port: 10000, node: { id: 'n1', name: 'n1', address: '10.0.0.1', status: 'ONLINE' } },
        { id: 'h1', role: 'exit', nodeId: 'n2', port: 443, priority: 0, enabled: true, node: { id: 'n2', name: 'n2', address: '10.0.0.2', status: 'ONLINE' } },
      ],
      bindings: [],
    });
    const result: any = await service.apply('c1', admin);
    expect(result.bridge).toBe(true);
    expect(agent.applyRelays).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1' }),
      expect.arrayContaining([expect.objectContaining({ mode: 'bridge-entry', bridgePort: expect.any(Number) })]),
    );
    expect(agent.applyRelays).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n2' }),
      expect.arrayContaining([expect.objectContaining({ mode: 'bridge-exit', bridgeHost: '10.0.0.1' })]),
    );
  });
});
