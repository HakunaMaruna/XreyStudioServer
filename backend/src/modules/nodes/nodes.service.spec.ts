import { NodeStatus, Role } from '@prisma/client';
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


describe('NodesService stale status', () => {
  const stale = new Date(Date.now() - 10 * 60_000);
  const fresh = new Date();
  const actor = { userId: 'u1', role: Role.ADMIN, organizationId: null } as any;

  it('shows an ONLINE node with stale heartbeat as OFFLINE', async () => {
    const findMany = jest.fn(async () => [{
      id: 'n1', status: NodeStatus.ONLINE, lastSeenAt: stale, agentVersion: null,
      metrics: [], geo: null, _count: { inbounds: 0, revisions: 0 },
    }]);
    const service = new NodesService({ node: { findMany } } as any, {} as any, {} as any);
    const rows = await service.findAll(actor);
    expect(rows[0]).toMatchObject({ status: NodeStatus.OFFLINE, online: false });
  });

  it('counts only fresh ONLINE nodes in stats', async () => {
    const count = jest.fn(async ({ where }: any) => {
      if (where.status === NodeStatus.ONLINE) return 2;
      if (where.status === NodeStatus.ERROR) return 1;
      return 7;
    });
    const service = new NodesService({ node: { count } } as any, {} as any, {} as any);
    expect(await service.stats(actor)).toEqual({ total: 7, online: 2, offline: 4, error: 1 });
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: NodeStatus.ONLINE, lastSeenAt: { gte: expect.any(Date) } }),
    }));
  });
});
