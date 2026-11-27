// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Proactive countermeasures against DPI recognition and address blocking.
 * Rotation is deliberately manual: clients must refresh their subscription
 * after shortId/SNI changes.
 */
@Injectable()
export class ResilienceService {
  constructor(
    private prisma: PrismaService,
    private configGenerator: ConfigGeneratorService,
  ) {}

  /** Put an exit address out of rotation for a cooldown period. */
  async quarantine(input: { address: string; nodeId?: string; reason?: string; hours?: number }) {
    const address = String(input.address || '').trim();
    if (!address) throw new Error('address is required');
    const hours = Math.min(720, Math.max(1, Number(input.hours) || 48));
    const until = new Date(Date.now() + hours * 3600_000);
    const row = await this.prisma.nodeQuarantine.upsert({
      where: { address },
      create: { address, nodeId: input.nodeId || null, reason: input.reason || 'manual', until },
      update: { nodeId: input.nodeId || null, reason: input.reason || 'manual', until },
    });
    const nodeId = input.nodeId || (await this.prisma.node.findFirst({ where: { address }, select: { id: true } }))?.id;
    if (nodeId) await this.configGenerator.createRevision(nodeId);
    return row;
  }

  async releaseQuarantine(address: string) {
    const row = await this.prisma.nodeQuarantine.deleteMany({ where: { address } });
    return { released: row.count };
  }

  listQuarantine() {
    return this.prisma.nodeQuarantine.findMany({
      orderBy: { until: 'desc' },
      take: 100,
    });
  }

  /**
   * Failover helper: addresses with repeated recent health-check failures
   * (including TCP stalls) are quarantined and their configs are regenerated.
   */
  async autoQuarantine(hours = 48) {
    const since = new Date(Date.now() - 30 * 60_000);
    const failed = await this.prisma.healthCheck.findMany({
      where: { checkedAt: { gte: since }, success: false },
      select: { host: true, nodeId: true, error: true, checkedAt: true },
      orderBy: { checkedAt: 'desc' },
    });
    const counts = new Map<string, { nodeId: string | null; error: string | null; count: number }>();
    for (const row of failed) {
      const current = counts.get(row.host) || { nodeId: row.nodeId, error: row.error, count: 0 };
      current.count += 1;
      counts.set(row.host, current);
    }
    const quarantined: string[] = [];
    for (const [address, info] of counts) {
      if (info.count < 2) continue;
      await this.quarantine({ address, nodeId: info.nodeId || undefined, reason: `health-check: ${info.error || 'failed'} x${info.count}`, hours });
      quarantined.push(address);
    }
    return { quarantined, checked: counts.size };
  }

  async rotateSni(nodeId?: string) {
    const inbounds = await this.prisma.inbound.findMany({
      where: { enabled: true, security: 'reality', ...(nodeId ? { nodeId } : {}) },
      select: { id: true, nodeId: true, settings: true, sni: true },
    });
    const pool = (process.env.REALITY_SNI_POOL || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const nodes = new Set<string>();

    for (const inbound of inbounds) {
      const settings: Record<string, any> = (inbound.settings as any) || {};
      const currentNames: string[] = Array.isArray(settings.realityServerNames)
        ? settings.realityServerNames
        : [];
      const nextNames = pool.length
        ? [pool[Math.floor(Math.random() * pool.length)], ...currentNames.filter((name) => !pool.includes(name))].slice(0, 3)
        : currentNames;
      const currentIds: string[] = Array.isArray(settings.realityShortIds) ? settings.realityShortIds : [];
      const shortIds = [randomBytes(8).toString('hex'), ...currentIds.slice(0, 1)];
      await this.prisma.inbound.update({
        where: { id: inbound.id },
        data: {
          settings: { ...settings, realityServerNames: nextNames, realityShortIds: shortIds },
          ...(nextNames[0] ? { sni: nextNames[0] } : {}),
        },
      });
      if (inbound.nodeId) nodes.add(inbound.nodeId);
    }

    for (const id of nodes) await this.configGenerator.createRevision(id);
    return { rotated: inbounds.length, nodes: [...nodes], sniPool: pool.length };
  }
}
