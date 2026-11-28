// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { InboundsService } from './inbounds.service';

describe('InboundsService update', () => {
  it('replaces clients and fallbacks in one transaction', async () => {
    const prisma: any = {
      inbound: {
        findFirst: jest.fn(async () => ({ id: 'i1', tag: 'tag', nodeId: null, userId: null })),
        findUnique: jest.fn(async () => ({ id: 'i1', tag: 'tag', nodeId: null, userId: null, clients: [], fallbacks: [] })),
        update: jest.fn(async ({ data }: any) => data),
      },
      inboundClient: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
        createMany: jest.fn(async () => ({ count: 1 })),
      },
      inboundFallback: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
        createMany: jest.fn(async () => ({ count: 1 })),
      },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    const service = new InboundsService(prisma);
    await service.update('i1', {
      clients: [{ userId: 'u1', trafficLimit: 0, enabled: true, sortIndex: 0 }],
      fallbacks: [{ childId: 'i2', path: '/', alpn: '', dest: '', xver: 0 }],
    } as any);
    expect(prisma.inboundClient.deleteMany).toHaveBeenCalledWith({ where: { inboundId: 'i1' } });
    expect(prisma.inboundClient.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(prisma.inboundFallback.deleteMany).toHaveBeenCalledWith({ where: { masterId: 'i1' } });
  });

  it('rejects a second inbound on a taken node port', async () => {
    const prisma: any = {
      inbound: {
        findMany: jest.fn(async () => [{ id: 'w', tag: 'wizard-abc', port: 443, listen: '0.0.0.0' }]),
        create: jest.fn(),
      },
      proxyChainHop: { findMany: jest.fn(async () => []) },
    };
    const service = new InboundsService(prisma);
    await expect(service.create({ tag: 'x', protocol: 'vless', port: 443, nodeId: 'n1' } as any))
      .rejects.toThrow('Port 443 on this node is already used by "wizard-abc"; free port: 2054');
    expect(prisma.inbound.create).not.toHaveBeenCalled();
    await expect(service.create({ tag: 'y', protocol: 'vless', port: 2054, nodeId: 'n1' } as any)).resolves.toBeUndefined();
  });
});
