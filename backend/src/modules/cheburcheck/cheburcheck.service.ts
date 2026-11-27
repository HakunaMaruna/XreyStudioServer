// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationEvent, Role } from '@prisma/client';
import { isIP } from 'net';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationSettingsService } from '../notifications/notification-settings.service';
import { NotificationsService } from '../notifications/notifications.service';

type CheckResponse = {
  id?: string | null;
  target?: string;
  target_type?: string | null;
  blocked?: boolean;
  ips?: string[];
  reverse_lookup?: string[];
  blocked_subnets?: string[];
  cdn_providers?: Record<string, unknown>;
  geo?: Record<string, unknown> | null;
  complaints?: Array<{ date: string; count: number }>;
};

type ProbeResult = {
  probe_id?: string;
  region?: string;
  provider?: string;
  asn?: string;
  cached?: boolean;
  verdicts?: string[];
  cdn_unblocked?: boolean;
  dns?: unknown;
  dpi_hop?: number | null;
  target_hop?: number | null;
};

type ProbeEvent = { event: string; data: Record<string, any> };

const VERDICT_PRIORITY = ['tspu_block', 'dns_spoofing', 'cdn_block', 'sni_block', 'uncertain', 'ok'];

@Injectable()
export class CheburcheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheburcheckService.name);
  private readonly probeTimeoutMs = Number(process.env.CHEBURCHECK_PROBE_TIMEOUT_MS || 45_000);
  private readonly scheduleMs = Math.max(3_600_000, Number(process.env.CHEBURCHECK_SCHEDULE_MS || 21_600_000));
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.runScheduled(), this.scheduleMs);
    this.timer.unref?.();
    setTimeout(() => this.runScheduled(), 60_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Periodic Cheburcheck run with a Telegram digest of every target. */
  async runScheduled() {
    if (this.running) return;
    this.running = true;
    try {
      const configured = (process.env.CHEBURCHECK_TARGETS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const domains = configured.length
        ? configured
        : (await this.prisma.nodeDomain.findMany({
            where: { releasedAt: null },
            select: { fqdn: true },
            take: 20,
          })).map((row) => row.fqdn);
      const targets = domains.length
        ? domains
        : (await this.prisma.node.findMany({ select: { address: true }, take: 20 })).map((row) => row.address);
      if (!targets.length) return;

      const system: AuthUser = { userId: 'system', email: 'system', role: Role.ADMIN, organizationId: null };
      const lines: string[] = [];
      let blocked = 0;
      for (const target of targets) {
        try {
          const result = await this.check({ target }, system);
          if (result.blocked) blocked += 1;
          const resultIps: string[] = Array.isArray(result.ips) ? result.ips.slice(0, 2).map(String) : [];
          lines.push(`• <code>${this.esc(target)}</code>${resultIps.length ? ` [${this.esc(resultIps.join(', '))}]` : ''} — ${result.blocked ? '⛔' : '✅'} ${this.esc(result.verdict)}`);
        } catch (error: any) {
          lines.push(`• <code>${this.esc(target)}</code> — ⚠️ error ${this.esc(error.message)}`);
        }
      }
      const text = [
        `<b>🔎 CHEBURCHECK · ${targets.length} целей · ${blocked} блокировок</b>`,
        `<blockquote expandable>${lines.join('\n')}</blockquote>`,
        `<i>Проверка: ${this.tgTime(Date.now())}</i>`,
      ].join('\n');
      await this.notifications.broadcast({ text, plainText: text, subject: 'XSS: cheburcheck digest' }, 'telegram');
    } catch (error: any) {
      this.logger.warn(`Scheduled cheburcheck failed: ${error.message}`);
    } finally {
      this.running = false;
    }
  }

  private esc(value: unknown) {
    return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  }

  private tgTime(ms: number) {
    return `<tg-time unix="${Math.floor(ms / 1000)}" format="t">${new Date(ms).toISOString()}</tg-time>`;
  }

  // Admin may point the panel to a self-hosted Cheburcheck API. SSRF-safe: HTTPS only
  // in production and no private/metadata destinations.
  private async base() {
    const raw = (await this.settings.value('CHEBURCHECK_BASE_URL'))
      || process.env.CHEBURCHECK_BASE_URL
      || 'https://cheburcheck.ru/api/v1';
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException('Invalid Cheburcheck API URL'); }
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Cheburcheck API URL must use https in production');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Cheburcheck API URL must use http or https');
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const parts = host.split('.').map(Number);
    const forbidden = host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1'
      || host === 'metadata.google.internal'
      || (isIP(host) === 4 && (
        parts[0] === 10 || parts[0] === 127 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      ))
      || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd');
    if (forbidden && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Private Cheburcheck API addresses are not allowed');
    }
    return raw.replace(/\/$/, '');
  }

  private async targetFor(input: { nodeId?: string; target?: string }, user: AuthUser) {
    if (input.nodeId) {
      const node = await this.prisma.node.findUnique({ where: { id: input.nodeId } });
      if (!node) throw new NotFoundException('Node not found');
      if (user.role !== Role.ADMIN && node.organizationId !== user.organizationId) {
        throw new ForbiddenException('Node belongs to another organization');
      }
      return { nodeId: node.id, target: input.target || node.address };
    }
    if (!input.target) throw new BadRequestException('nodeId or target is required');
    return { nodeId: null, target: input.target };
  }

  private validateTarget(target: string) {
    const value = target.trim();
    if (!value || value.length > 253) throw new BadRequestException('Invalid target');
    if (!/^[A-Za-z0-9._:\-/]+$/.test(value)) throw new BadRequestException('Invalid target');
    return value;
  }

  private async fetchCheck(target: string): Promise<CheckResponse> {
    const response = await fetch(`${await this.base()}/check?target=${encodeURIComponent(target)}`, {
      headers: { 'User-Agent': 'XreyStudioServer/cheburcheck' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new BadRequestException(`Cheburcheck check failed: HTTP ${response.status}`);
    }
    return response.json() as Promise<CheckResponse>;
  }

  // Читаем SSE до события done; token уходит только в заголовке, не в URL и не в логи.
  private async collectProbe(id: string, token: string): Promise<{ results: ProbeResult[]; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    const results: ProbeResult[] = [];
    let started: Record<string, any> | undefined;
    let done: Record<string, any> | undefined;
    try {
      const response = await fetch(`${await this.base()}/probe/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'XreyStudioServer/cheburcheck',
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        return { results, error: `Probe stream HTTP ${response.status}` };
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let bytes = 0;
      while (true) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const event: ProbeEvent = { event: 'message', data: {} };
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) event.event = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              const raw = line.slice(5).trim();
              try { event.data = JSON.parse(raw); } catch { /* ignore malformed frame */ }
            }
          }
          if (event.event === 'started') started = event.data;
          if (event.event === 'result' && results.length < 100) results.push(event.data as ProbeResult);
          if (event.event === 'done') { done = event.data; break; }
        }
        if (done) break;
      }
      void reader.cancel().catch(() => undefined);
      if (!done) return { results, error: 'Probe stream timed out' };
      return { results };
    } catch (error: any) {
      return { results, error: error?.name === 'AbortError' ? 'Probe timeout' : 'Probe request failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  private verdictFor(check: CheckResponse, results: ProbeResult[]) {
    if (check.blocked || (check.blocked_subnets?.length || 0) > 0) return 'blocked';
    const flat = results.flatMap((result) => result.verdicts || []);
    return VERDICT_PRIORITY.find((value) => flat.includes(value)) || 'unknown';
  }

  async check(input: { nodeId?: string; target?: string }, user: AuthUser) {
    const { nodeId, target: rawTarget } = await this.targetFor(input, user);
    const target = this.validateTarget(rawTarget);
    const check = await this.fetchCheck(target);
    const token = await this.settings.value('CHEBURCHECK_API_TOKEN');
    let results: ProbeResult[] = [];
    let probeError: string | undefined;

    if (check.id && token) {
      const probe = await this.collectProbe(check.id, token);
      results = probe.results;
      probeError = probe.error;
    } else if (!token) {
      probeError = 'CHEBURCHECK_API_TOKEN is not configured';
    }

    const verdict = this.verdictFor(check, results);
    const payload = {
      id: check.id || null,
      target,
      targetType: check.target_type || null,
      ips: check.ips || [],
      reverseLookup: check.reverse_lookup || [],
      blockedSubnets: check.blocked_subnets || [],
      cdnProviders: check.cdn_providers || {},
      geo: check.geo || null,
      complaints: check.complaints || [],
      blocked: Boolean(check.blocked) || ['blocked', 'tspu_block', 'dns_spoofing', 'cdn_block'].includes(verdict),
      verdict,
      probes: results.map((result) => ({
        probeId: result.probe_id,
        region: result.region,
        provider: result.provider,
        asn: result.asn,
        verdicts: result.verdicts || [],
        cached: Boolean(result.cached),
        cdnUnblocked: Boolean(result.cdn_unblocked),
      })),
      probeError,
    };
    const stored = await this.prisma.cheburcheckResult.create({
      data: {
        nodeId,
        target,
        targetType: check.target_type || null,
        blocked: Boolean(check.blocked) || ['blocked', 'tspu_block', 'dns_spoofing', 'cdn_block'].includes(verdict),
        verdict,
        payload: payload as any,
      },
    });

    if (stored.blocked) {
      const nodeInfo = nodeId
        ? await this.prisma.node.findUnique({ where: { id: nodeId }, select: { organizationId: true, name: true, address: true } })
        : null;
      const ips: string[] = (Array.isArray(check.ips) && check.ips.length ? check.ips : (payload.ips || [])).slice(0, 3).map(String);
      await this.notifications.emit(NotificationEvent.CHEBURCHECK_BLOCKED, {
        text: [
          '<b>⛔ CHEBURCHECK: БЛОКИРОВКА</b>',
          `<blockquote>Цель: <code>${this.esc(target)}</code>`,
          `Вердикт: ${this.esc(verdict)}`,
          ...(ips.length ? [`IP: <code>${this.esc(ips.join(', '))}</code>`] : []),
          ...(nodeInfo?.name ? [`Узел: <code>${this.esc(nodeInfo.name)}</code>`] : (nodeId ? [`Узел: <code>${this.esc(nodeId)}</code>`] : [])),
          '</blockquote>',
          `<b>Время:</b> ${this.tgTime(Date.now())}`,
        ].join('\n'),
        plainText: `Cheburcheck: ${target} — ${verdict}${ips.length ? ` (IP: ${ips.join(', ')})` : ''}`,
        subject: `XSS: cheburcheck ${target}`,
        webhook: { event: NotificationEvent.CHEBURCHECK_BLOCKED, target, verdict, nodeId },
        severity: verdict === 'blocked' ? 'critical' : 'warning',
        dedupeKey: `cheburcheck:${nodeId || target}:${verdict}`,
      }, nodeInfo?.organizationId ?? null)
        .catch((error) => this.logger.warn(`Cheburcheck alert failed: ${error.message}`));
    }

    return { ...payload, id: stored.id, checkedAt: stored.createdAt, nodeId };
  }

  async results(query: { nodeId?: string; limit?: string }, user: AuthUser) {
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const where: Record<string, unknown> = {};
    if (query.nodeId) {
      const node = await this.prisma.node.findUnique({ where: { id: query.nodeId } });
      if (!node) throw new NotFoundException('Node not found');
      if (user.role !== Role.ADMIN && node.organizationId !== user.organizationId) {
        throw new ForbiddenException('Node belongs to another organization');
      }
      where.nodeId = node.id;
    } else if (user.role !== Role.ADMIN) {
      where.node = { organizationId: user.organizationId || '__none__' };
    }
    return this.prisma.cheburcheckResult.findMany({ where: where as any, orderBy: { createdAt: 'desc' }, take: limit });
  }

  async status() {
    try {
      const response = await fetch(`${await this.base()}/status`, { signal: AbortSignal.timeout(10_000) });
      const status = await response.json();
      const token = await this.settings.value('CHEBURCHECK_API_TOKEN');
      let credits: number | null = null;
      if (token) {
        const res = await fetch(`${await this.base()}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) credits = (await res.json()).credits ?? null;
      }
      return { configured: Boolean(token), credits, ...status };
    } catch (error: any) {
      throw new BadRequestException(`Cheburcheck unavailable: ${error.message}`);
    }
  }
}
