import { SquadBindingService } from './squad-binding.service';

describe('SquadBindingService', () => {
  let prisma: any;
  let service: SquadBindingService;

  beforeEach(() => {
    prisma = {
      inbound: { findUnique: jest.fn(async () => ({ id: 'i1' })) },
      squad: { findUnique: jest.fn(async () => ({ id: 's1' })) },
      inboundSquad: {
        findMany: jest.fn(async () => [{ inboundId: 'i1', squadId: 's1' }]),
        upsert: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      user: { findMany: jest.fn(async () => [{ id: 'u1' }, { id: 'u2' }]) },
      inboundClient: {
        findMany: jest.fn(async () => [{ userId: 'u1' }, { userId: 'u-old' }]),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        createMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    service = new SquadBindingService(prisma);
  });

  it('binds a squad and syncs only squad-sourced clients', async () => {
    const result = await service.bind('i1', 's1');
    expect(result).toEqual({ inboundId: 'i1', squadId: 's1', bound: true });
    expect(prisma.inboundClient.deleteMany).toHaveBeenCalledWith({
      where: { inboundId: 'i1', userId: { in: ['u-old'] }, sourceSquadId: 's1' },
    });
    expect(prisma.inboundClient.createMany).toHaveBeenCalledWith({
      data: [{ inboundId: 'i1', userId: 'u2', sourceSquadId: 's1' }],
      skipDuplicates: true,
    });
  });

  it('removes only clients created by the unbound squad', async () => {
    await service.unbind('i1', 's1');
    expect(prisma.inboundClient.deleteMany).toHaveBeenCalledWith({
      where: { inboundId: 'i1', sourceSquadId: 's1' },
    });
  });

  it('re-syncs all linked inbounds when squad membership changes', async () => {
    const result = await service.syncSquad('s1');
    expect(result).toEqual([{ inboundId: 'i1', squadId: 's1', added: 1, removed: 1 }]);
  });
});
