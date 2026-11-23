import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { isIP } from 'net';

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

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);

  private base(node: { address: string; agentUrl?: string | null }) {
    const raw = node.agentUrl || `http://${node.address}:9090`;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid agent URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Agent URL must use http or https');
    }
    if (process.env.ALLOW_PRIVATE_AGENT_URLS !== 'true' && isPrivateHost(url.hostname)) {
      throw new BadRequestException('Private agent URLs are not allowed');
    }
    return raw.replace(/\/$/, '');
  }

  private request(url: string, payload: any, timeoutMs = 5000, method = 'POST'): Promise<any> {
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const body = method === 'GET' ? '' : JSON.stringify(payload || {});
      const isHttps = target.protocol === 'https:';
      const options: https.RequestOptions = {
        method,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers: {
          'X-Agent-Secret': process.env.AGENT_SECRET || process.env.AGENT_TOKEN || '',
          ...(method === 'GET'
            ? {}
            : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
        },
        timeout: timeoutMs,
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
        });
      });
      req.on('timeout', () => req.destroy(new Error('Agent request timeout')));
      req.on('error', reject);
      if (method !== 'GET') req.write(body);
      req.end();
    });
  }

  async applyConfig(node: { address: string; agentUrl?: string | null }, config: any, version: number) {
    const base = this.base(node);
    try {
      return await this.request(`${base.replace(/\/$/, '')}/config`, { version, config });
    } catch (e: any) {
      this.logger.warn(`Config push failed for ${node.address}: ${e.message}`);
      return { applied: false, error: e.message };
    }
  }

  async restart(node: { address: string; agentUrl?: string | null }) {
    const base = this.base(node);
    return this.request(`${base.replace(/\/$/, '')}/restart-xray`, {});
  }

  async getLogs(
    node: { address: string; agentUrl?: string | null },
    service: 'xray' | 'singbox',
    lines: number,
  ) {
    const base = this.base(node);
    const query = new URLSearchParams({ service, lines: String(lines) });
    return this.request(`${base.replace(/\/$/, '')}/logs?${query}`, undefined, 15000, 'GET');
  }
}
