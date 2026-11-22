import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
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
    await this.nodes.verifyNodeToken(nodeId, token);
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
}
