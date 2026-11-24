import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import { TrafficReportDto } from './dto/traffic.dto';

@Injectable()
export class TrafficService {
  constructor(
    private prisma: PrismaService,
    private nodes: NodesService,
  ) {}

  async report(nodeId: string, dto: TrafficReportDto, token: string) {
    const node = await this.nodes.verifyNodeToken(nodeId, token);
    const period = dto.period || new Date().toISOString().slice(0, 7);
    let recorded = 0;
    let skipped = 0;
    let expired = 0;

    for (const entry of dto.entries || []) {
      const where: Prisma.UserWhereInput = entry.subscriptionToken
        ? { subscriptionToken: entry.subscriptionToken }
        : entry.userId
          ? { id: entry.userId }
          : entry.email
            ? { email: entry.email.toLowerCase() }
            : {};
      // Агент может репортить трафик только пользователей своей организации.
      where.organizationId = node.organizationId || null;
      if (!Object.keys(where).length) {
        skipped += 1;
        continue;
      }
      const user = await this.prisma.user.findFirst({ where });
      if (!user) {
        skipped += 1;
        continue;
      }

      const up = BigInt(Math.max(0, Math.round(entry.up || 0)));
      const down = BigInt(Math.max(0, Math.round(entry.down || 0)));
      await this.prisma.userTraffic.create({
        data: { userId: user.id, nodeId, period, bytesUp: up, bytesDown: down },
      });

      const exceeded = user.trafficLimit > 0n && user.trafficUsed + up + down >= user.trafficLimit;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          trafficUsed: { increment: up + down },
          ...(exceeded ? { status: UserStatus.EXPIRED } : {}),
        },
      });
      recorded += 1;
      if (exceeded) expired += 1;
    }

    return { recorded, skipped, expired, period };
  }

  async history(query: { userId?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = query.userId ? { userId: query.userId } : {};
    const [data, total, sum] = await Promise.all([
      this.prisma.userTraffic.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userTraffic.count({ where }),
      this.prisma.userTraffic.aggregate({ where, _sum: { bytesUp: true, bytesDown: true } }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      bytesUp: sum._sum.bytesUp?.toString() || '0',
      bytesDown: sum._sum.bytesDown?.toString() || '0',
    };
  }

  async chart(query: { userId?: string; days?: string }) {
    const days = Math.min(90, Math.max(1, Number(query.days) || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const where: Prisma.UserTrafficWhereInput = {
      createdAt: { gte: since },
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const rows = await this.prisma.userTraffic.findMany({ where, orderBy: { createdAt: 'asc' } });
    const grouped = new Map<string, { up: bigint; down: bigint }>();
    for (const row of rows) {
      const day = new Date(row.createdAt).toISOString().slice(0, 10);
      const current = grouped.get(day) || { up: 0n, down: 0n };
      current.up += row.bytesUp;
      current.down += row.bytesDown;
      grouped.set(day, current);
    }
    const series = Array.from(grouped.entries()).map(([date, value]) => ({
      date,
      up: value.up.toString(),
      down: value.down.toString(),
      total: (value.up + value.down).toString(),
    }));
    return { days, series, total: series.length };
  }

  async exportCsv(query: { userId?: string; from?: string; to?: string }) {
    const where: Prisma.UserTrafficWhereInput = {};
    if (query.userId) where.userId = query.userId;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt as any), gte: from };
    if (to && !Number.isNaN(to.getTime())) where.createdAt = { ...(where.createdAt as any), lte: to };
    const rows = await this.prisma.userTraffic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    return toCsv(
      ['createdAt', 'userId', 'nodeId', 'period', 'bytesUp', 'bytesDown', 'total'],
      rows.map((row) => [
        new Date(row.createdAt).toISOString(),
        row.userId,
        row.nodeId || '',
        row.period,
        row.bytesUp.toString(),
        row.bytesDown.toString(),
        (row.bytesUp + row.bytesDown).toString(),
      ]),
    );
  }
}
