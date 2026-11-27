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
