// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { isIP } from 'net';
import { decryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Client } from 'ssh2';
import { promises as dns } from 'dns';

function isPrivateHost(host: string) {
  if (host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1') return true;
  if (isIP(host) !== 4) return false;
  const parts = host.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 169 && parts[1] === 254 ||
    parts[0] === 127
  );
}

// Links local/metadata address never valid for an agent, even in private mode.
function isForbiddenHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped IPv6 bypasses naive isIP(v6) checks.
  const mapped = h.startsWith('::ffff:') ? h.slice(7) : '';
  if (mapped && isIP(mapped) === 4 && isPrivateHost(mapped)) return true;
  if (h === '0.0.0.0' || h === '::' || h === 'metadata.google.internal') return true;
  if (isIP(h) === 4) {
    const p = h.split('.').map(Number);
    if (p[0] === 169 && p[1] === 254) return true; // link-local / cloud metadata
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  }
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 link-local/ULA
  return false;
}

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private readonly lastPingError = new Map<string, string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private base(node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null }, allowPrivate = false) {
    const explicit = node.agentUrl;
    const raw = explicit || process.env.AGENT_BASE_URL || `http://${node.address}:9090`;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid agent URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Agent URL must use http or https');
    }
    if (url.search || url.hash) {
      throw new BadRequestException('Agent URL must not contain a query string or fragment');
    }
    const fromAddress = !explicit && !process.env.AGENT_BASE_URL;
    if (
      process.env.NODE_ENV === 'production' &&
      (explicit || fromAddress) &&
      url.protocol !== 'https:' &&
      process.env.ALLOW_HTTP_AGENT_URLS !== 'true' &&
      process.env.ALLOW_PRIVATE_AGENT_URLS !== 'true'
    ) {
      throw new BadRequestException('Agent URL must use https in production');
    }
    if (isForbiddenHost(url.hostname)) {
      throw new BadRequestException('Link-local or metadata agent URLs are not allowed');
    }
    // IPv6 разрешаем только loopback в приватном режиме.
    const hostOnly = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostOnly) === 6 && !(allowPrivate && hostOnly === '::1')) {
      throw new BadRequestException('IPv6 agent URLs are not allowed');
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const mapped = hostname.toLowerCase().startsWith('::ffff:') ? hostname.slice(7) : '';
    if (!allowPrivate && process.env.ALLOW_PRIVATE_AGENT_URLS !== 'true'
        && (isPrivateHost(url.hostname) || (mapped && isPrivateHost(mapped)))) {
      throw new BadRequestException('Private agent URLs are not allowed');
    }
    // Drop any query/fragment; callers append their own paths safely.
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  }

  /** Open a TCP stream to the agent through an installed jump node (SSH forwardOut). */
  private async jumpSocket(node: { address: string; jumpNodeId?: string | null }): Promise<{ socket: any; close: () => void } | null> {
    if (!node.jumpNodeId || !this.prisma) return null;
    const jumpNode = await this.prisma.node.findUnique({
      where: { id: node.jumpNodeId }, select: { address: true },
    });
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId: node.jumpNodeId } });
    if (!jumpNode || !credential) {
      throw new BadRequestException('Jump node is not configured for agent access');
    }
    const config: any = {
      host: credential.sshHost || jumpNode.address,
      port: credential.sshPort || 22,
      username: credential.sshUser || 'root',
      readyTimeout: 15_000,
    };
    if (credential.password) config.password = decryptSecret(credential.password);
    if (credential.privateKey) {
      config.privateKey = decryptSecret(credential.privateKey);
      if (credential.passphrase) config.passphrase = decryptSecret(credential.passphrase);
    }
    if (!config.password && !config.privateKey) throw new BadRequestException('Jump node has no usable SSH credentials');
    const ssh = new Client();
    await new Promise<void>((resolve, reject) => {
      ssh.once('ready', () => resolve());
      ssh.once('error', reject);
      ssh.connect(config);
    });
    try {
      const socket = await new Promise<any>((resolve, reject) => {
        ssh.forwardOut('127.0.0.1', 0, node.address, 9090, (error, stream) => {
          if (error || !stream) reject(error || new Error('Jump forwardOut failed'));
          else resolve(stream);
        });
      });
      return { socket, close: () => { try { ssh.end(); } catch {} } };
    } catch (error) {
      ssh.end();
      throw error;
    }
  }

  /** Agents use their own AGENT_TOKEN as the shared secret. Prefer the per-node
   * stored value; fall back to the global env for the local/legacy agent. */
  private secretFor(node?: { agentSecret?: string | null; jumpNodeId?: string | null }): string {
    if (node?.agentSecret) {
      try { return decryptSecret(node.agentSecret); }
      catch (error: any) { this.logger.warn(`Failed to decrypt agent secret: ${error.message}`); }
    }
    return process.env.AGENT_SECRET || process.env.AGENT_TOKEN || '';
  }

  private request(url: string, payload: any, timeoutMs = 5000, method = 'POST', allowPrivate = false, secret?: string, node?: { address: string; jumpNodeId?: string | null }): Promise<any> {
    return new Promise((resolve, reject) => {
      let jump: { socket: any; close: () => void } | null = null;
      void (async () => {
        const target = new URL(url);
        if (node?.jumpNodeId) jump = await this.jumpSocket(node);
        const body = method === 'GET' ? '' : JSON.stringify(payload || {});
        const isHttps = target.protocol === 'https:';
        // Pin the connection to an address we validated: prevents DNS rebinding between base() and connect().
        let resolvedHost: string | undefined;
        const host = target.hostname.replace(/^\[|\]$/g, '');
        if (isIP(host) === 0) {
          try {
            const addresses = await dns.lookup(host, { all: true });
            if (!addresses.length) throw new Error('no DNS records');
            const privateAllowed = allowPrivate || process.env.ALLOW_PRIVATE_AGENT_URLS === 'true';
            for (const address of addresses) {
              const value = address.family === 6 && address.address.toLowerCase().startsWith('::ffff:')
                ? address.address.slice(7)
                : address.address;
              if (isForbiddenHost(value) || (!privateAllowed && isPrivateHost(value))) {
                throw new Error(`resolved address ${address.address} is not allowed`);
              }
            }
            const chosen = addresses[0];
            resolvedHost = chosen.address;
          } catch (error: any) {
            reject(new BadRequestException(`Unsafe agent host: ${error.message}`));
            return;
          }
        }
        const options: https.RequestOptions = {
          hostname: resolvedHost || target.hostname,
          ...(isHttps ? { servername: target.hostname } : {}),
          method,
          port: target.port || (isHttps ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          headers: {
            'X-Agent-Secret': secret || '',
            ...(method === 'GET'
              ? {}
              : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
          },
          timeout: timeoutMs,
          ...(jump ? { createConnection: () => jump!.socket, lookup: undefined } : {}),
          ...(isHttps
            ? {
                ca: process.env.AGENT_CA ? readFileSync(process.env.AGENT_CA) : undefined,
                cert: process.env.AGENT_CERT ? readFileSync(process.env.AGENT_CERT) : undefined,
                key: process.env.AGENT_KEY ? readFileSync(process.env.AGENT_KEY) : undefined,
              }
            : {}),
        };
        const req = (isHttps ? https : http).request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch {
                resolve({ raw: data });
              }
            } else {
              reject(new Error(`Agent responded ${res.statusCode}: ${data}`));
            }
            jump?.close();
          });
        });
        req.on('timeout', () => req.destroy(new Error('Agent request timeout')));
        req.on('error', (error) => { jump?.close(); reject(error); });
        if (method !== 'GET') req.write(body);
        req.end();
      })().catch((error) => { jump?.close(); reject(error); });
    });
  }

  async applyConfig(node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null }, config: any, version: number) {
    const base = this.base(node, true);
    try {
      return await this.request(`${base.replace(/\/$/, '')}/config`, { version, config }, 5000, 'POST', true, this.secretFor(node), node);
    } catch (e: any) {
      this.logger.warn(`Config push failed for ${node.address}: ${e.message}`);
      return { applied: false, error: e.message };
    }
  }

  async restart(node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null }) {
    const base = this.base(node, true);
    return this.request(`${base.replace(/\/$/, '')}/restart-xray`, {}, 5000, 'POST', true, this.secretFor(node), node);
  }

  async installCertificate(
    node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null },
    payload: { certificate: string; privateKey: string; ca?: string; hostname: string },
  ) {
    return this.request(`${this.base(node, true)}/certificate`, { payload }, 15000, 'POST', true, this.secretFor(node), node);
  }

  async applyRelays(
    node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null },
    relays: Array<{
      id: string;
      listenPort?: number;
      targetHost?: string;
      targetPort?: number;
      enabled: boolean;
      mode?: 'direct' | 'bridge-entry' | 'bridge-exit';
      bridgePort?: number;
      bridgeHost?: string;
      replicas?: number;
      targets?: Array<{ host: string; port: number; priority?: number }>;
    }>,
  ) {
    return this.request(`${this.base(node, true)}/relays`, { relays }, 15000, 'POST', true, this.secretFor(node), node);
  }

  async relayStatus(node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null }) {
    return this.request(`${this.base(node, true)}/relays`, undefined, 5000, 'GET', true, this.secretFor(node), node);
  }

  async installDecoyCertificate(
    node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null },
    payload: { certificate: string; privateKey: string; hostname: string },
  ) {
    return this.request(`${this.base(node, true)}/decoy-certificate`, { payload }, 15000, 'POST', true, this.secretFor(node), node);
  }

  async health(node: { address: string; agentUrl?: string | null; jumpNodeId?: string | null }) {
    const base = this.base(node, true);
    return this.request(`${base.replace(/\/$/, '')}/health`, undefined, 5000, 'GET', true, this.secretFor(node), node);
  }

  // Быстрый HTTP-RTT до агента: используется как «пинг» в карточке метрик ноды.
  async ping(node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null }) {
    const started = Date.now();
    try {
      const base = this.base(node, true);
      await this.request(`${base.replace(/\/$/, '')}/health`, undefined, 5000, 'GET', true, this.secretFor(node), node);
      this.lastPingError.delete(node.address);
      return { reachable: true, latencyMs: Date.now() - started };
    } catch (error: any) {
      if (this.lastPingError.get(node.address) !== error.message) {
        this.lastPingError.set(node.address, error.message);
        this.logger.warn(`Ping failed for ${node.address}: ${error.message}`);
      }
      return { reachable: false, latencyMs: null, error: error.message };
    }
  }

  async getLogs(
    node: { address: string; agentUrl?: string | null; agentSecret?: string | null; jumpNodeId?: string | null },
    service: 'xray' | 'singbox',
    lines: number,
  ) {
    const base = this.base(node);
    const query = new URLSearchParams({ service, lines: String(lines) });
    return this.request(`${base.replace(/\/$/, '')}/logs?${query}`, undefined, 15000, 'GET', false, this.secretFor(node), node);
  }
}
