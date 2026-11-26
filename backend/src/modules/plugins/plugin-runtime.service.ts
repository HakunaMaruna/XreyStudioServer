import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { isIP } from 'net';
import { promises as dns } from 'dns';
import * as path from 'path';
import { NotificationsService } from '../notifications/notifications.service';
import { PluginStorageService } from './plugin-storage.service';

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 256 * 1024;

@Injectable()
export class PluginRuntimeService {
  private readonly logger = new Logger(PluginRuntimeService.name);

  constructor(
    private readonly storage: PluginStorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private isBlockedAddress(host: string) {
    const h = host.toLowerCase().replace(/^\[|\]$/g, '');
    const mapped = h.startsWith('::ffff:') ? h.slice(7) : '';
    const ipv4 = mapped || h;
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === 'metadata.google.internal') return true;
    if (isIP(ipv4) === 4) {
      const p = ipv4.split('.').map(Number);
      if (p[0] === 127 || p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
          (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) ||
          (p[0] === 100 && p[1] >= 64 && p[1] <= 127)) return true;
    }
    return h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::');
  }

  private async allowedUrl(raw: string) {
    let url: URL;
    try { url = new URL(raw); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (this.isBlockedAddress(host)) return false;
    if (isIP(host) === 0) {
      try {
        const addresses = await dns.lookup(host, { all: true });
        if (!addresses.length || addresses.some((address) => this.isBlockedAddress(address.address))) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  async invoke(pluginId: string, hook: string, context: { settings?: unknown; entry?: string; payload?: unknown } = {}) {
    const artifactPath = await this.storage.artifactDir(pluginId);
    const manifest = await this.storage.manifest(pluginId);
    const entry = context.entry || manifest?.entrypoints?.backend || null;
    if (!entry) return null;
    const workerPath = path.join(__dirname, 'plugin-worker.js');
    const child = spawn(process.execPath, [`--max-old-space-size=64`, workerPath], {
      env: {
        PATH: process.env.PATH || '',
        NODE_ENV: process.env.NODE_ENV || 'production',
        XSS_PLUGIN_DIR: artifactPath,
        XSS_PLUGIN_ID: pluginId,
        XSS_PLUGIN_ENTRY: entry,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return new Promise<any>((resolve, reject) => {
      let output = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`Plugin ${pluginId} hook ${hook} timed out`));
        }
      }, TIMEOUT_MS);

      const finish = (error?: Error, value?: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill('SIGTERM');
        if (error) reject(error);
        else resolve(value);
      };

      const answer = (id: number, value: any, error?: string) => {
        child.stdin.write(`${JSON.stringify({ type: 'response', id, value, error })}\n`);
      };

      const handle = async (msg: any) => {
        if (msg.type === 'log') {
          this.logger.log(`[${pluginId}] ${msg.level || 'info'}: ${String(msg.message).slice(0, 500)}`);
          await this.storage.log(pluginId, msg.level || 'info', String(msg.message).slice(0, 500));
          return;
        }
        if (!['storage.get', 'storage.set', 'storage.delete', 'settings.get', 'http.request', 'events.emit'].includes(msg.type)) return;
        try {
          let value: any = null;
          if (msg.type === 'storage.get') value = await this.storage.get(pluginId, msg.payload.key);
          if (msg.type === 'storage.set') await this.storage.set(pluginId, msg.payload.key, msg.payload.value);
          if (msg.type === 'storage.delete') await this.storage.delete(pluginId, msg.payload.key);
          if (msg.type === 'settings.get') value = await this.storage.settings(pluginId);
          if (msg.type === 'http.request') {
            if (!await this.allowedUrl(String(msg.payload.url || ''))) throw new Error('Network target is not allowed');
            const response = await fetch(String(msg.payload.url), {
              method: String(msg.payload.method || 'GET'),
              headers: msg.payload.headers || {},
              body: msg.payload.body ? JSON.stringify(msg.payload.body) : undefined,
              signal: AbortSignal.timeout(5000),
            });
            value = { status: response.status, body: (await response.text()).slice(0, 100_000) };
          }
          if (msg.type === 'events.emit') {
            await this.notifications.broadcast({ text: `[${pluginId}] ${String(msg.payload.event)}: ${JSON.stringify(msg.payload.payload || {}).slice(0, 500)}` });
          }
          answer(msg.id, value);
        } catch (error: any) {
          answer(msg.id, null, error?.message || 'runtime error');
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > MAX_OUTPUT) { finish(new Error('Plugin output limit exceeded')); return; }
        const lines = output.split('\n');
        output = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'result') {
              if (msg.error) finish(new Error(String(msg.error).slice(0, 500)));
              else finish(null, msg.value);
            } else {
              void handle(msg);
            }
          } catch { /* ignore malformed worker output */ }
        }
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(0, 16 * 1024); });
      child.on('error', (error) => finish(error));
      child.on('exit', (code) => {
        if (code && code !== 0) finish(new Error(`Plugin worker exited ${code}: ${stderr.slice(0, 300)}`));
      });

      child.stdin.write(`${JSON.stringify({
        type: 'invoke', id: 1, hook,
        settings: context.settings || {},
        payload: context.payload ?? null,
      })}\n`);
    });
  }
}
