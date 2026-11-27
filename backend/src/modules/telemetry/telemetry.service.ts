// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_VERSION } from '../../version';

export type TelemetryPayload = {
  installId: string;
  version: string;
  mode: 'control' | 'tenant';
  capturedAt: string;
  counts: Record<string, number>;
  events: Array<{ action: string; count: number }>;
};

const EVENT_ALLOWLIST = [
  'node.error', 'node.offline', 'config.apply.failed', 'backup.failed',
  'plugin.quarantine', 'health.check.failed', 'snapshot.failed',
];

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private timer?: NodeJS.Timeout;
  readonly licenseUrl = 'https://github.com/HakunaMaruna/XreyStudioServer/blob/main/docs/telemetry-license.md';

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const interval = Number(process.env.TELEMETRY_INTERVAL_MS || 6 * 3600_000);
    // First report shortly after boot, then periodically. unref() keeps tests/CI from hanging.
    setTimeout(() => {
      this.send().catch((error) => this.logger.warn(`Telemetry send failed: ${error.message}`));
    }, 60_000).unref();
    this.timer = setInterval(() => {
      this.send().catch((error) => this.logger.warn(`Telemetry send failed: ${error.message}`));
    }, interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async setting() {
    const existing = await this.prisma.telemetrySetting.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return this.prisma.telemetrySetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', installId: randomUUID() },
      update: {},
    });
  }

  async status() {
    const row = await this.setting();
    return {
      accepted: row.accepted,
      declined: row.declined,
      enabled: row.enabled,
      installId: row.installId,
      licenseUrl: this.licenseUrl,
      configured: Boolean(process.env.TELEMETRY_URL),
      mode: process.env.PANEL_MODE === 'control' ? 'control' : 'tenant',
      lastSentAt: row.lastSentAt,
    };
  }

  async consent(body: { accepted?: boolean; enabled?: boolean; declined?: boolean }) {
    if (!body || typeof body !== 'object') throw new BadRequestException('consent body is required');
    const declined = body.declined === true;
    if (!declined && typeof body.accepted !== 'boolean') throw new BadRequestException('accepted is required');
    await this.setting();
    const updated = await this.prisma.telemetrySetting.update({
      where: { id: 'default' },
      data: {
        accepted: declined ? false : Boolean(body.accepted),
        declined,
        enabled: !declined && body.accepted ? Boolean(body.enabled) : false,
        licenseAcceptedAt: !declined && body.accepted ? new Date() : null,
      },
    });
    if (updated.enabled) await this.send().catch((error) => this.logger.warn(`Telemetry send failed: ${error.message}`));
    return this.status();
  }

  async collect(): Promise<TelemetryPayload> {
    const setting = await this.setting();
    const since = new Date(Date.now() - 24 * 3600_000);
    const [users, nodes, inbounds, enabledInbounds, rules, hosts, routingProfiles, organizations,
      plans, payments, balancers, dnsProfiles, plugins, snapshots, events] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.node.count(),
      this.prisma.inbound.count(),
      this.prisma.inbound.count({ where: { enabled: true } }),
      this.prisma.rule.count(),
      this.prisma.host.count(),
      this.prisma.routingProfile.count(),
      this.prisma.organization.count(),
      this.prisma.subscriptionPlan.count(),
      this.prisma.payment.count(),
      this.prisma.balancer.count(),
      this.prisma.dnsProfile.count(),
      this.prisma.plugin.count(),
      this.prisma.systemSnapshot.count(),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: since }, action: { in: EVENT_ALLOWLIST } },
        _count: { _all: true },
      }),
    ]);
    return {
      installId: setting.installId,
      version: APP_VERSION,
      mode: process.env.PANEL_MODE === 'control' ? 'control' : 'tenant',
      capturedAt: new Date().toISOString(),
      counts: {
        users, nodes, inbounds, enabledInbounds, rules, hosts, routingProfiles,
        organizations, plans, payments, balancers, dnsProfiles, plugins, snapshots,
      },
      events: events.map((row) => ({ action: row.action, count: row._count._all })),
    };
  }

  async send() {
    const setting = await this.setting();
    const url = process.env.TELEMETRY_URL;
    if (!setting.accepted || !setting.enabled || !url) return { sent: false, reason: 'telemetry disabled' };
    const payload = await this.collect();
    const response = await fetch(`${url.replace(/\/$/, '')}/api/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TELEMETRY_TOKEN ? { 'X-API-Token': process.env.TELEMETRY_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new BadRequestException(`Telemetry server responded ${response.status}`);
    await this.prisma.telemetrySetting.update({ where: { id: 'default' }, data: { lastSentAt: new Date() } });
    return { sent: true, installId: payload.installId };
  }

  async ingest(payload: TelemetryPayload, ctx: ApiTokenContext) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Invalid telemetry payload');
    }
    if (!payload.installId || typeof payload.installId !== 'string') throw new BadRequestException('installId is required');
    if (payload.installId.length > 128 || !/^[A-Za-z0-9-]+$/.test(payload.installId)) throw new BadRequestException('Invalid installId');
    const mode = payload.mode === 'control' ? 'control' : 'tenant';
    const counts = (payload.counts && typeof payload.counts === 'object' && !Array.isArray(payload.counts))
      ? payload.counts as Record<string, unknown> : {};
    if (Object.keys(counts).length > 64 || Object.values(counts).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new BadRequestException('Invalid counts');
    }
    if (payload.events !== undefined && !Array.isArray(payload.events)) {
      throw new BadRequestException('events must be an array');
    }
    const installation = await this.prisma.telemetryInstallation.upsert({
      where: { installId: payload.installId },
      create: { installId: payload.installId, mode, version: String(payload.version || '').slice(0, 40), lastSeen: new Date() },
      update: { mode, version: String(payload.version || '').slice(0, 40), lastSeen: new Date() },
    });
    const safeCounts = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key.slice(0, 64), Number(value)]));
    const safeEvents = (payload.events || []).slice(0, 32).map((event: any) => ({
      action: typeof event?.action === 'string' ? event.action : '',
      count: Number(event?.count),
    })).filter((event: any) => EVENT_ALLOWLIST.includes(event.action) && Number.isFinite(event.count) && event.count >= 0);
    await this.prisma.telemetrySnapshot.create({
      data: {
        installationId: installation.id,
        payload: {
          installId: payload.installId,
          version: String(payload.version || '').slice(0, 40),
          mode,
          capturedAt: typeof payload.capturedAt === 'string' ? payload.capturedAt.slice(0, 40) : null,
          counts: safeCounts,
          events: safeEvents,
        } as any,
      },
    });
    for (const event of safeEvents) {
      await this.prisma.telemetryLog.create({
        data: {
          installationId: installation.id,
          level: 'event',
          source: event.action,
          message: `${event.action}: ${Number(event.count)} in 24h`,
        },
      });
    }
    void ctx;
    return { received: true, installationId: installation.id };
  }

  async installations() {
    const rows = await this.prisma.telemetryInstallation.findMany({
      orderBy: { lastSeen: 'desc' },
      include: { snapshots: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return rows.map((row) => ({
      installId: row.installId,
      mode: row.mode,
      version: row.version,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      latest: row.snapshots[0]?.payload || null,
    }));
  }

  async logs(limit = 100) {
    return this.prisma.telemetryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, limit)),
      include: { installation: { select: { installId: true } } },
    });
  }
}
