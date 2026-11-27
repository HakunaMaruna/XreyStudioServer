// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect } from 'net';
import * as tls from 'tls';
import { NotificationEvent } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

const INTERVAL = Math.max(30, Number(process.env.HEALTH_CHECK_INTERVAL || 300)) * 1000;

@Injectable()
export class HealthChecksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthChecksService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastDigestAt = 0;
  private readonly digestMs = Math.max(3_600_000, Number(process.env.NODE_DIGEST_INTERVAL_MS || 21_600_000));

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.run(), INTERVAL);
    this.timer.unref?.();
    setTimeout(() => this.run(), 5000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** TLS-eye probe for Reality inbounds: a browser-like handshake to the camouflage SNI. */
  private tlsProbe(host: string, port: number, servername: string, timeout = 3000): Promise<{ success: boolean; latencyMs?: number; bytes: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      let bytes = 0;
      let done = false;
      const socket = tls.connect({ host, port, servername, rejectUnauthorized: false });
      const finish = (result: { success: boolean; latencyMs?: number; bytes: number; error?: string }) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeout);
      socket.on('secureConnect', () => finish({ success: true, latencyMs: Date.now() - start, bytes }));
      socket.on('data', (chunk) => { bytes += chunk.length; });
      socket.on('timeout', () => finish({ success: false, bytes, error: 'tls-stall' }));
      socket.on('error', (error) => finish({ success: false, bytes, error: error.message }));
    });
  }

  private esc(value: unknown) {
    return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  }

  private tgTime(ms: number) {
    return `<tg-time unix="${Math.floor(ms / 1000)}" format="t">${new Date(ms).toISOString()}</tg-time>`;
  }

  private probe(host: string, port: number, timeout = 3000): Promise<{ success: boolean; latencyMs?: number; bytes: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = connect({ host, port });
      let done = false;
      const finish = (result: { success: boolean; latencyMs?: number; bytes: number; error?: string }) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeout);
      socket.on('connect', () => finish({ success: true, latencyMs: Date.now() - start, bytes: 0 }));
      socket.on('timeout', () => finish({ success: false, error: 'timeout', bytes: 0 }));
      socket.on('error', (err) => finish({ success: false, error: err.message, bytes: 0 }));
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
      const rows: Array<{ node: string; tag: string; status: string }> = [];
      const previous = new Map<string, boolean>();
      if (results.length === 0 && inbounds.length) {
        const recent = await this.prisma.healthCheck.findMany({
          where: { checkedAt: { gte: new Date(Date.now() - INTERVAL * 2) } },
          orderBy: { checkedAt: 'desc' },
        });
        for (const check of recent) {
          if (!previous.has(check.inboundId)) previous.set(check.inboundId, check.success);
        }
      }
      for (const inbound of inbounds) {
        if (!inbound.node) continue;
        // Проверяем только адрес самой ноды: `settings.publicHost` задаётся
        // тенантом и превращал фоновый пробер в SSRF/сканер портов.
        const host = inbound.node.address;
        const settings: any = inbound.settings;
        const realityNames: string[] = Array.isArray(settings?.realityServerNames) ? settings.realityServerNames : [];
        const sni = realityNames[0] || inbound.sni || undefined;
        const result = inbound.security === 'reality' && sni
          ? await this.tlsProbe(host, inbound.port, sni)
          : await this.probe(host, inbound.port);
        const last = previous.get(inbound.id);
        previous.set(inbound.id, result.success);
        if (last !== undefined && last !== result.success) {
          await this.notifyAvailability(inbound.node, inbound as any, result.success, result.error, result.latencyMs, result.bytes);
        }
        rows.push({
          node: String(inbound.node.name || inbound.nodeId).slice(0, 14),
          tag: inbound.tag.slice(0, 13),
          status: result.success
            ? `✅ ${result.latencyMs ?? 0}мс`
            : `🔴 ${String(result.error || 'FAIL').slice(0, 16)}`,
        });
        results.push({
          nodeId: inbound.nodeId!,
          inboundId: inbound.id,
          tag: inbound.tag,
          protocol: inbound.protocol,
          host,
          port: inbound.port,
          success: result.success,
          latencyMs: result.latencyMs ?? null,
          bytes: result.bytes ?? 0,
          error: result.error ?? null,
        });
      }
      if (results.length) await this.prisma.healthCheck.createMany({ data: results });
      this.logger.log(`Client-eye checks: ${results.filter((r) => r.success).length}/${results.length} passed`);
      if (Date.now() - this.lastDigestAt >= this.digestMs && rows.length) {
        this.lastDigestAt = Date.now();
        const now = Date.now();
        const okCount = results.filter((item) => item.success).length;
        const table = [
          'Узел           Inbound        Статус',
          '──────────────────────────────────',
          ...rows.slice(0, 30).map((row) =>
            `${this.esc(row.node).padEnd(15, ' ')}${this.esc(row.tag).padEnd(15, ' ')}${row.status}`),
        ].join('\n');
        const text = [
          `<b>🩺 ДОСТУПНОСТЬ НОД · ${okCount}/${results.length}</b>`,
          `<pre>${table}</pre>`,
          `<i>Проверка: ${this.tgTime(now)} · следующий дайджест: ${this.tgTime(now + this.digestMs)}</i>`,
        ].join('\n');
        await this.notifications.broadcast({ text, plainText: text, subject: 'XSS: node availability digest' }, 'telegram')
          .catch((error) => this.logger.warn(`Node digest failed: ${error.message}`));
      }
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

  private async notifyAvailability(
    node: { id: string; name: string; address: string; organizationId: string | null },
    inbound: { id: string; tag: string; protocol: string; port: number },
    success: boolean,
    error?: string | null,
    latencyMs?: number | null,
    bytes?: number,
  ) {
    const event = success ? NotificationEvent.NODE_ONLINE : NotificationEvent.NODE_OFFLINE;
    const check = success
      ? `TLS-eye ✅ · ${latencyMs ?? 0} мс · ${bytes ?? 0} Б`
      : `⛔ ${this.esc(error || 'FAIL')}`;
    const text = [
      `<b>${success ? '🟢 УЗЕЛ ДОСТУПЕН' : '🔴 УЗЕЛ НЕДОСТУПЕН'}</b>`,
      `<blockquote>${this.esc(node.name)} · <code>${this.esc(inbound.tag)}</code>`,
      `<code>${this.esc(node.address)}:${inbound.port}</code> · ${this.esc(inbound.protocol.toUpperCase())}`,
      `${check}</blockquote>`,
      `<b>Проверка:</b> TLS-eye / TCP handshake`,
      `<b>Время:</b> ${this.tgTime(Date.now())}`,
    ].join('\n');
    try {
      await this.notifications.emit(event, {
        text,
        plainText: text.replace(/<[^>]*>/g, ''),
        subject: `XSS: ${inbound.tag} ${success ? 'online' : 'offline'}`,
        webhook: {
          event,
          node: { id: node.id, name: node.name, address: node.address },
          inbound: { id: inbound.id, tag: inbound.tag, protocol: inbound.protocol },
        },
      }, node.organizationId);
    } catch (e) {
      this.logger.error(`Failed to emit health check event for ${inbound.id}`, e as Error);
    }
  }

}
