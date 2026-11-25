import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';

type Range = { from?: string; to?: string };
type TrafficRange = Range & { days?: string | number };

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

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

  // Динамика трафика: суточные корзины + сравнение с предыдущим периодом такой же длины.
  private resolveTrafficRange(range: TrafficRange) {
    const now = new Date();
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    let from: Date;
    let to: Date;

    if (range.from) {
      from = new Date(range.from);
      if (Number.isNaN(from.getTime())) throw new BadRequestException('Invalid from date');
      from = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    } else {
      const days = Math.min(MAX_DAYS, Math.max(1, Number(range.days) || 30));
      from = new Date(todayEnd.getTime() - days * DAY_MS);
    }
    if (range.to) {
      const parsed = new Date(range.to);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid to date');
      to = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + 1));
    } else {
      to = todayEnd;
    }

    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    if (days < 1) throw new BadRequestException('to must be after from');
    if (days > MAX_DAYS) throw new BadRequestException(`Range cannot exceed ${MAX_DAYS} days`);

    return { from, to, days, previousFrom: new Date(from.getTime() - days * DAY_MS) };
  }

  async trafficTimeseries(range: TrafficRange = {}) {
    const { from, to, days, previousFrom } = this.resolveTrafficRange(range);
    const [rows, previousRows] = await Promise.all([
      this.prisma.userTraffic.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { createdAt: true, bytesUp: true, bytesDown: true, userId: true },
      }),
      this.prisma.userTraffic.findMany({
        where: { createdAt: { gte: previousFrom, lt: from } },
        select: { bytesUp: true, bytesDown: true },
      }),
    ]);

    const buckets = new Map<string, { date: string; up: bigint; down: bigint; total: bigint }>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      buckets.set(date, { date, up: 0n, down: 0n, total: 0n });
    }
    const perUser = new Map<string, bigint>();
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      const up = BigInt(row.bytesUp || 0n);
      const down = BigInt(row.bytesDown || 0n);
      if (bucket) {
        bucket.up += up;
        bucket.down += down;
        bucket.total = bucket.up + bucket.down;
      }
      if (row.userId) perUser.set(row.userId, (perUser.get(row.userId) || 0n) + up + down);
    }

    const data = Array.from(buckets.values()).map((bucket) => ({
      date: bucket.date,
      bytesUp: bucket.up.toString(),
      bytesDown: bucket.down.toString(),
      total: bucket.total.toString(),
    }));
    const sum = (list: Array<{ up: bigint; down: bigint }>) =>
      list.reduce((acc, row) => ({ up: acc.up + row.up, down: acc.down + row.down }), { up: 0n, down: 0n });
    const previousTotals = (previousRows as Array<{ bytesUp: bigint; bytesDown: bigint }>).map((row) => ({
      up: BigInt(row.bytesUp || 0n),
      down: BigInt(row.bytesDown || 0n),
    }));

    const current = sum(Array.from(buckets.values()));
    const previous = sum(previousTotals);
    const currentTotal = Number(current.up + current.down);
    const previousTotal = Number(previous.up + previous.down);
    const changePct = previousTotal ? Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1)) : null;

    const topIds = Array.from(perUser.entries())
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, 5)
      .map(([id]) => id);
    const users = topIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: topIds } }, select: { id: true, email: true } })
      : [];
    const emailById = new Map(users.map((user) => [user.id, user.email]));
    const topUsers = topIds.map((id) => ({
      userId: id,
      email: emailById.get(id) || id,
      bytes: (perUser.get(id) || 0n).toString(),
    }));

    return {
      data,
      topUsers,
      summary: {
        bytesUp: current.up.toString(),
        bytesDown: current.down.toString(),
        total: (current.up + current.down).toString(),
        previousTotal: (previous.up + previous.down).toString(),
        changePct,
      },
      range: {
        from: from.toISOString().slice(0, 10),
        to: new Date(to.getTime() - DAY_MS).toISOString().slice(0, 10),
        days,
      },
    };
  }

  async trafficTimeseriesCsv(range: TrafficRange = {}) {
    const { data } = await this.trafficTimeseries(range);
    return toCsv(
      ['date', 'bytesUp', 'bytesDown', 'total'],
      data.map((row) => [row.date, row.bytesUp, row.bytesDown, row.total]),
    );
  }

  async cheburcheck(range: Range = {}) {
    const createdAt = this.dateWhere(range);
    const rows = await this.prisma.cheburcheckResult.findMany({
      where: createdAt ? { createdAt } : {},
      include: { node: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        nodeId: row.nodeId,
        nodeName: row.node?.name || null,
        target: row.target,
        targetType: row.targetType,
        blocked: row.blocked,
        verdict: row.verdict,
        probes: Array.isArray((row.payload as any)?.probes) ? (row.payload as any).probes.length : 0,
      })),
      total: rows.length,
    };
  }

  async cheburcheckCsv(range: Range = {}) {
    const { data } = await this.cheburcheck(range);
    return toCsv(
      ['createdAt', 'node', 'target', 'targetType', 'verdict', 'blocked', 'probes'],
      data.map((row) => [
        new Date(row.createdAt).toISOString(),
        row.nodeName || '',
        row.target,
        row.targetType || '',
        row.verdict || '',
        String(row.blocked),
        row.probes,
      ]),
    );
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
