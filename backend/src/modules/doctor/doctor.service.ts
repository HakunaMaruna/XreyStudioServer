// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isAgentOutdated } from '../../version';

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
    const [database, nodes, health, revisions, inbounds] = await Promise.all([
      this.checkDatabase(),
      this.prisma.node.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          lastSeenAt: true,
          certificateExpiresAt: true,
          agentVersion: true,
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
      this.prisma.inbound.findMany({
        where: { enabled: true },
        select: { id: true, nodeId: true, port: true, protocol: true, security: true, settings: true },
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
    const portKeys = new Map<string, number>();
    for (const inbound of inbounds) {
      const key = `${inbound.nodeId || 'global'}:${inbound.port}`;
      portKeys.set(key, (portKeys.get(key) || 0) + 1);
    }
    const duplicates = [...portKeys.entries()].filter(([, count]) => count > 1);
    checks.push({
      id: 'duplicate_ports',
      severity: duplicates.length ? 'warning' : 'ok',
      title: 'Inbound ports',
      detail: duplicates.length ? `${duplicates.length} port collision(s): ${duplicates.slice(0, 3).map(([key]) => key).join(', ')}` : 'No duplicate inbound ports',
      fixable: false,
    });

    const outdated = nodes.filter((node) => isAgentOutdated(node.agentVersion));
    checks.push({
      id: 'agent_versions',
      severity: outdated.length ? 'warning' : 'ok',
      title: 'Agent versions',
      detail: outdated.length ? `${outdated.length} node(s) below minimum agent version` : 'All agents compatible',
      fixable: false,
    });

    const missingSni = inbounds.filter((inbound) => {
      if (inbound.security !== 'reality') return false;
      const settings = (inbound.settings || {}) as any;
      return !Array.isArray(settings.realityServerNames) || settings.realityServerNames.length === 0;
    });
    checks.push({
      id: 'reality_sni',
      severity: missingSni.length ? 'warning' : 'ok',
      title: 'Reality SNI',
      detail: missingSni.length ? `${missingSni.length} Reality inbound(s) without camouflage SNI` : 'All Reality inbounds have SNI',
      fixable: false,
    });

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
