import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

type AgentNode = { address: string; agentUrl?: string | null };

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);

  private request(
    url: string,
    options: { method?: string; payload?: any; timeoutMs?: number } = {},
  ): Promise<any> {
    const { method = 'POST', payload, timeoutMs = 5000 } = options;
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const body = payload === undefined ? undefined : JSON.stringify(payload);
      const isHttps = target.protocol === 'https:';
      const secret = process.env.AGENT_SECRET || process.env.AGENT_TOKEN || '';
      const headers: Record<string, string | number> = {
        Authorization: `Bearer ${secret}`,
        'X-Agent-Secret': secret,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      const requestOptions: https.RequestOptions = {
        method,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers,
        timeout: timeoutMs,
        ...(isHttps
          ? {
              ca: process.env.AGENT_CA ? readFileSync(process.env.AGENT_CA) : undefined,
              cert: process.env.AGENT_CERT ? readFileSync(process.env.AGENT_CERT) : undefined,
              key: process.env.AGENT_KEY ? readFileSync(process.env.AGENT_KEY) : undefined,
            }
          : {}),
      };
      const req = (isHttps ? https : http).request(requestOptions, (res) => {
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
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  private base(node: AgentNode) {
    return (node.agentUrl || `http://${node.address}:9090`).replace(/\/$/, '');
  }

  async applyConfig(node: AgentNode, config: any, version: number) {
    try {
      return await this.request(`${this.base(node)}/config`, { payload: { version, config } });
    } catch (e: any) {
      this.logger.warn(`Config push failed for ${node.address}: ${e.message}`);
      return { applied: false, error: e.message };
    }
  }

  async restart(node: AgentNode) {
    return this.request(`${this.base(node)}/restart-xray`, { payload: {} });
  }

  async logs(node: AgentNode, limit = 200) {
    return this.request(`${this.base(node)}/logs?limit=${limit}`, { method: 'GET' });
  }
}
