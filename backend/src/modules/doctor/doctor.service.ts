// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isAgentOutdated } from '../../version';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { NodeProvisionService } from '../node-provision/node-provision.service';
import { CertificatesService } from '../certificates/certificates.service';

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
    private provision: NodeProvisionService,
    private certificates: CertificatesService,
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
      fixable: expiredCerts.length > 0,
      ...(expiredCerts[0] ? { entityId: expiredCerts[0].id } : {}),
    });

    const latestByNode = new Map(revisions.map((r) => [r.nodeId, r._max.createdAt]));
    const portKeys = new Map<string, number>();
    for (const inbound of inbounds) {
      const key = `${inbound.nodeId || 'global'}:${inbound.port}`;
      portKeys.set(key, (portKeys.get(key) || 0) + 1);
    }
    const duplicates = [...portKeys.entries()].filter(([, count]) => count > 1);
    const duplicateInbound = duplicates.length
      ? inbounds.find((inbound) => {
          const key = `${inbound.nodeId || 'global'}:${inbound.port}`;
          return duplicates.some(([candidate]) => candidate === key);
        })
      : undefined;
    checks.push({
      id: 'duplicate_ports',
      severity: duplicates.length ? 'warning' : 'ok',
      title: 'Inbound ports',
      detail: duplicates.length ? `${duplicates.length} port collision(s): ${duplicates.slice(0, 3).map(([key]) => key).join(', ')}` : 'No duplicate inbound ports',
      fixable: Boolean(duplicateInbound),
      ...(duplicateInbound ? { entityId: duplicateInbound.id } : {}),
    });

    const outdated = nodes.filter((node) => isAgentOutdated(node.agentVersion));
    checks.push({
      id: 'agent_versions',
      severity: outdated.length ? 'warning' : 'ok',
      title: 'Agent versions',
      detail: outdated.length ? `${outdated.length} node(s) below minimum agent version` : 'All agents compatible',
      fixable: outdated.length > 0,
      ...(outdated[0] ? { entityId: outdated[0].id } : {}),
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
      fixable: missingSni.length > 0,
      ...(missingSni[0] ? { entityId: missingSni[0].id } : {}),
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

  async fix(checkId: string, entityId?: string, actor?: AuthUser) {
    const systemActor: AuthUser = actor || { userId: 'system', email: 'system', role: Role.ADMIN };
    if (checkId === 'stale_revision') {
      if (!entityId || !/^[A-Za-z0-9_-]{1,64}$/.test(entityId)) {
        throw new BadRequestException('Valid node id is required');
      }
      const node = await this.prisma.node.findUnique({ where: { id: entityId }, select: { id: true, status: true } });
      if (!node) throw new BadRequestException('Node not found');
      if (node.status !== 'ONLINE') throw new BadRequestException('Node must be ONLINE before applying a revision');
      return this.config.applyRevision(node.id);
    }
    if (checkId === 'agent_versions') {
      if (!entityId) throw new BadRequestException('Node id is required');
      return this.provision.updateAgentLatest(entityId, systemActor);
    }
    if (checkId === 'certificates') {
      if (!entityId) throw new BadRequestException('Node id is required');
      return this.certificates.issue(entityId);
    }
    if (checkId === 'duplicate_ports') {
      if (!entityId) throw new BadRequestException('Inbound id is required');
      const inbound = await this.prisma.inbound.findUnique({ where: { id: entityId } });
      if (!inbound) throw new BadRequestException('Inbound not found');
      const used = new Set(
        (await this.prisma.inbound.findMany({ where: { OR: [{ nodeId: inbound.nodeId }, { nodeId: null }] }, select: { port: true } })).map((row) => row.port),
      );
      let port = inbound.port + 1;
      while (used.has(port) && port < 65535) port += 1;
      if (port >= 65535) throw new BadRequestException('No free port available');
      await this.prisma.inbound.update({ where: { id: entityId }, data: { port } });
      if (inbound.nodeId) await this.config.createRevision(inbound.nodeId);
      return { inboundId: entityId, port };
    }
    if (checkId === 'reality_sni') {
      if (!entityId) throw new BadRequestException('Inbound id is required');
      const inbound = await this.prisma.inbound.findUnique({ where: { id: entityId } });
      if (!inbound) throw new BadRequestException('Inbound not found');
      const pool = (process.env.REALITY_SNI_POOL || 'www.microsoft.com').split(',').map((value) => value.trim()).filter(Boolean);
      const settings: Record<string, any> = (inbound.settings as any) || {};
      await this.prisma.inbound.update({
        where: { id: entityId },
        data: {
          settings: { ...settings, realityServerNames: [pool[0]] },
          sni: pool[0],
        },
      });
      if (inbound.nodeId) await this.config.createRevision(inbound.nodeId);
      return { inboundId: entityId, sni: pool[0] };
    }
    throw new BadRequestException('Check is not fixable');
  }
}
