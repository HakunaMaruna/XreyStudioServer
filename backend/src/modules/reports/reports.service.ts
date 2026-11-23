import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';

type Range = { from?: string; to?: string };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateWhere(range: Range): Prisma.DateTimeFilter | undefined {
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(range.to) : null;
    if (from && Number.isNaN(from.getTime())) return undefined;
    if (to && Number.isNaN(to.getTime())) return undefined;
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  async organizations(range: Range = {}) {
    const createdAt = this.dateWhere(range);
    const organizations = await this.prisma.organization.findMany({
      include: { _count: { select: { users: true, nodes: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const buckets = [
      ...organizations.map((org) => ({ id: org.id, name: org.name, slug: org.slug, organizationId: org.id })),
      { id: '__none__', name: 'No organization', slug: '-', organizationId: null },
    ];

    const rows = await Promise.all(
      buckets.map(async (bucket) => {
        const userWhere: Prisma.UserWhereInput = { organizationId: bucket.organizationId || undefined };
        if (bucket.organizationId === null) userWhere.organizationId = null;
        const nodeWhere: Prisma.NodeWhereInput = { organizationId: bucket.organizationId || undefined };
        if (bucket.organizationId === null) nodeWhere.organizationId = null;

        const userIds = (await this.prisma.user.findMany({ where: userWhere, select: { id: true } })).map((user) => user.id);
        const [users, activeUsers, nodes, onlineNodes, traffic] = await Promise.all([
          this.prisma.user.count({ where: userWhere }),
          this.prisma.user.count({ where: { ...userWhere, status: 'ACTIVE' } }),
          this.prisma.node.count({ where: nodeWhere }),
          this.prisma.node.count({ where: { ...nodeWhere, status: 'ONLINE' } }),
          this.prisma.userTraffic.aggregate({
            where: { userId: { in: userIds }, ...(createdAt ? { createdAt } : {}) },
            _sum: { bytesUp: true, bytesDown: true },
          }),
        ]);

        const bytesUp = traffic._sum.bytesUp || 0n;
        const bytesDown = traffic._sum.bytesDown || 0n;
        return {
          id: bucket.id,
          name: bucket.name,
          slug: bucket.slug,
          users,
          activeUsers,
          nodes,
          onlineNodes,
          bytesUp: bytesUp.toString(),
          bytesDown: bytesDown.toString(),
          total: (bytesUp + bytesDown).toString(),
        };
      }),
    );

    return { data: rows, total: rows.length };
  }

  async protocols() {
    const inbounds = await this.prisma.inbound.findMany({
      select: { protocol: true, enabled: true, userId: true, nodeId: true },
    });

    const grouped = new Map<string, { protocol: string; inbounds: number; enabled: number; users: Set<string>; nodes: Set<string> }>();
    for (const inbound of inbounds) {
      const protocol = (inbound.protocol || 'unknown').toLowerCase();
      const row = grouped.get(protocol) || {
        protocol,
        inbounds: 0,
        enabled: 0,
        users: new Set<string>(),
        nodes: new Set<string>(),
      };
      row.inbounds += 1;
      if (inbound.enabled) row.enabled += 1;
      if (inbound.userId) row.users.add(inbound.userId);
      if (inbound.nodeId) row.nodes.add(inbound.nodeId);
      grouped.set(protocol, row);
    }

    const data = Array.from(grouped.values())
      .map((row) => ({
        protocol: row.protocol,
        inbounds: row.inbounds,
        enabled: row.enabled,
        users: row.users.size,
        nodes: row.nodes.size,
      }))
      .sort((a, b) => b.inbounds - a.inbounds);

    return { data, total: data.length };
  }

  organizationsCsv(range: Range = {}) {
    return this.organizations(range).then(({ data }) =>
      toCsv(
        ['organization', 'slug', 'users', 'activeUsers', 'nodes', 'onlineNodes', 'bytesUp', 'bytesDown', 'total'],
        data.map((row) => [
          row.name,
          row.slug,
          row.users,
          row.activeUsers,
          row.nodes,
          row.onlineNodes,
          row.bytesUp,
          row.bytesDown,
          row.total,
        ]),
      ),
    );
  }

  protocolsCsv() {
    return this.protocols().then(({ data }) =>
      toCsv(
        ['protocol', 'inbounds', 'enabled', 'users', 'nodes'],
        data.map((row) => [row.protocol, row.inbounds, row.enabled, row.users, row.nodes]),
      ),
    );
  }
}
