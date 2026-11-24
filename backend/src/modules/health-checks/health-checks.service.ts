import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect } from 'net';
import { PrismaService } from '../../prisma/prisma.service';

const INTERVAL = Math.max(30, Number(process.env.HEALTH_CHECK_INTERVAL || 300)) * 1000;

@Injectable()
export class HealthChecksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthChecksService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.run(), INTERVAL);
    this.timer.unref?.();
    setTimeout(() => this.run(), 5000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private probe(host: string, port: number, timeout = 3000): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = connect({ host, port });
      let done = false;
      const finish = (result: { success: boolean; latencyMs?: number; error?: string }) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeout);
      socket.on('connect', () => finish({ success: true, latencyMs: Date.now() - start }));
      socket.on('timeout', () => finish({ success: false, error: 'timeout' }));
      socket.on('error', (err) => finish({ success: false, error: err.message }));
    });
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const inbounds = await this.prisma.inbound.findMany({
        where: { enabled: true },
        include: { node: true },
      });
      const results = [];
      for (const inbound of inbounds) {
        if (!inbound.node) continue;
        const settings = (inbound.settings || {}) as any;
        const host = settings.publicHost || inbound.node.address;
        const result = await this.probe(host, inbound.port);
        results.push({
          nodeId: inbound.nodeId!,
          inboundId: inbound.id,
          tag: inbound.tag,
          protocol: inbound.protocol,
          host,
          port: inbound.port,
          success: result.success,
          latencyMs: result.latencyMs ?? null,
          error: result.error ?? null,
        });
      }
      if (results.length) await this.prisma.healthCheck.createMany({ data: results });
      this.logger.log(`Client-eye checks: ${results.filter((r) => r.success).length}/${results.length} passed`);
    } catch (error: any) {
      this.logger.warn(`Client-eye checks failed: ${error.message}`);
    } finally {
      this.running = false;
    }
  }

  list(query: { nodeId?: string; limit?: string }) {
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 200));
    return this.prisma.healthCheck.findMany({
      where: query.nodeId ? { nodeId: query.nodeId } : {},
      include: { node: { select: { id: true, name: true } } },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  }

  latest() {
    return this.prisma.healthCheck.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });
  }
}
