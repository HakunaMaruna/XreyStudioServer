import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { PrismaService } from '../../prisma/prisma.service';

export type DoctorCheck = {
  id: string;
  severity: 'ok' | 'warning' | 'critical';
  title: string;
  detail: string;
  fixable: boolean;
  entityId?: string;
};

@Injectable()
export class DoctorService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigGeneratorService,
  ) {}

  private async checkDatabase(): Promise<DoctorCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { id: 'database', severity: 'ok', title: 'Database', detail: 'Reachable', fixable: false };
    } catch {
      return {
        id: 'database',
        severity: 'critical',
        title: 'Database',
        detail: 'Database query failed',
        fixable: false,
      };
    }
  }

  async check(): Promise<DoctorCheck[]> {
    const [database, nodes, health, revisions] = await Promise.all([
      this.checkDatabase(),
      this.prisma.node.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          lastSeenAt: true,
          certificateExpiresAt: true,
        },
      }),
      this.prisma.healthCheck.findMany({
        where: { checkedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, success: false },
        select: { nodeId: true, checkedAt: true },
        orderBy: { checkedAt: 'desc' },
        take: 100,
      }),
      this.prisma.configRevision.groupBy({
        by: ['nodeId'],
        _max: { createdAt: true },
      }),
    ]);

    const checks: DoctorCheck[] = [database];
    const offline = nodes.filter(
      (node) =>
        node.status === 'OFFLINE' ||
        (node.lastSeenAt !== null && node.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000),
    );
    checks.push({
      id: 'nodes_offline',
      severity: offline.length ? 'warning' : 'ok',
      title: 'Nodes',
      detail: offline.length ? `${offline.length} node(s) offline or stale` : 'All nodes reporting',
      fixable: false,
    });

    const failedNodes = new Set(health.map((h) => h.nodeId));
    checks.push({
      id: 'health_checks',
      severity: failedNodes.size ? 'warning' : 'ok',
      title: 'Client-eye health checks',
      detail: failedNodes.size ? `${failedNodes.size} node(s) failed in the last 24h` : 'No failures in the last 24h',
      fixable: false,
    });

    const expiredCerts = nodes.filter(
      (node) =>
        node.certificateExpiresAt !== null && node.certificateExpiresAt.getTime() <= Date.now(),
    );
    checks.push({
      id: 'certificates',
      severity: expiredCerts.length ? 'critical' : 'ok',
      title: 'Node certificates',
      detail: expiredCerts.length ? `${expiredCerts.length} expired certificate(s)` : 'No expired certificates',
      fixable: false,
    });

    const latestByNode = new Map(revisions.map((r) => [r.nodeId, r._max.createdAt]));
    for (const node of nodes) {
      const last = latestByNode.get(node.id);
      if (!last || last.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) {
        checks.push({
          id: 'stale_revision',
          severity: 'warning',
          title: 'Stale config revision',
          detail: `Node ${node.name} has no recent config revision`,
          fixable: true,
          entityId: node.id,
        });
      }
    }
    return checks;
  }

  async fix(checkId: string, entityId?: string) {
    if (checkId !== 'stale_revision') throw new BadRequestException('Check is not fixable');
    if (!entityId || !/^[A-Za-z0-9_-]{1,64}$/.test(entityId)) {
      throw new BadRequestException('Valid node id is required');
    }
    const node = await this.prisma.node.findUnique({ where: { id: entityId }, select: { id: true, status: true } });
    if (!node) throw new BadRequestException('Node not found');
    if (node.status !== 'ONLINE') throw new BadRequestException('Node must be ONLINE before applying a revision');
    return this.config.applyRevision(node.id);
  }
}
