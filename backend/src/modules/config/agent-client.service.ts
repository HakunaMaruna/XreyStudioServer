import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);

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
    const base = node.agentUrl || `http://${node.address}:9090`;
    try {
      return await this.request(`${base.replace(/\/$/, '')}/config`, { version, config });
    } catch (e: any) {
      this.logger.warn(`Config push failed for ${node.address}: ${e.message}`);
      return { applied: false, error: e.message };
    }
  }

  async restart(node: { address: string; agentUrl?: string | null }) {
    const base = node.agentUrl || `http://${node.address}:9090`;
    return this.request(`${base.replace(/\/$/, '')}/restart-xray`, {});
  }

  async getLogs(
    node: { address: string; agentUrl?: string | null },
    service: 'xray' | 'singbox',
    lines: number,
  ) {
    const base = node.agentUrl || `http://${node.address}:9090`;
    const query = new URLSearchParams({ service, lines: String(lines) });
    return this.request(`${base.replace(/\/$/, '')}/logs?${query}`, undefined, 15000, 'GET');
  }
}
