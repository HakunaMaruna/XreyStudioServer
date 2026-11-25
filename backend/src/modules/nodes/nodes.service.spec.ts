import { Role } from '@prisma/client';
import { NodesService } from './nodes.service';

describe('NodesService.pings', () => {
  it('returns latency per node and keeps the tenant scope', async () => {
    const findMany = jest.fn(async () => [
      { id: 'n1', address: '10.0.0.1', agentUrl: null },
      { id: 'n2', address: '10.0.0.2', agentUrl: null },
    ]);
    const ping = jest.fn(async (node: { address: string }) => node.address === '10.0.0.1'
      ? { reachable: true, latencyMs: 42 }
      : { reachable: false, latencyMs: 3000 });
    const service = new NodesService(
      { node: { findMany } } as any,
      {} as any,
      { ping } as any,
    );

    const result = await service.pings({ userId: 'u1', role: Role.OPERATOR, organizationId: 'org-1' } as any);

    expect(result).toEqual({ n1: 42, n2: null });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
    expect(ping).toHaveBeenCalledTimes(2);
  });
});
