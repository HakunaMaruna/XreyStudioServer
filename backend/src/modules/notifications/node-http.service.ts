// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { decryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Client } from 'ssh2';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { URL } from 'url';

export type NodeHttpResult = { ok: boolean; status: number; text: string };

/** Performs an HTTP request from a node's network via SSH forwarding. */
@Injectable()
export class NodeHttpService {
  private readonly logger = new Logger(NodeHttpService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async connect(nodeId: string): Promise<{ conn: Client; jump: Client | null }> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, address: true, jumpNodeId: true },
    });
    if (!node) throw new BadRequestException('Notification relay node not found');
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId } });
    if (!credential) throw new BadRequestException('Relay node has no saved SSH credentials');

    const open = async (host: string, port: number, login: typeof credential): Promise<Client> => {
      const config: any = {
        host,
        port,
        username: login.sshUser || 'root',
        readyTimeout: 15_000,
      };
      if (login.password) config.password = decryptSecret(login.password);
      if (login.privateKey) {
        config.privateKey = decryptSecret(login.privateKey);
        if (login.passphrase) config.passphrase = decryptSecret(login.passphrase);
      }
      if (!config.password && !config.privateKey) throw new BadRequestException('Relay node has no usable SSH credentials');
      const client = new Client();
      await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.once('error', reject);
        client.connect(config);
      });
      return client;
    };

    if (!node.jumpNodeId) return { conn: await open(credential.sshHost || node.address, credential.sshPort || 22, credential), jump: null };

    const jumpNode = await this.prisma.node.findUnique({ where: { id: node.jumpNodeId }, select: { address: true } });
    const jumpCred = await this.prisma.wizardCredential.findUnique({ where: { nodeId: node.jumpNodeId } });
    if (!jumpNode || !jumpCred) throw new BadRequestException('Notification jump node is not configured');
    const jump = await open(jumpCred.sshHost || jumpNode.address, jumpCred.sshPort || 22, jumpCred);
    try {
      const sock = await new Promise<any>((resolve, reject) => {
        jump.forwardOut('127.0.0.1', 0, credential.sshHost || node.address, credential.sshPort || 22, (error, stream) => {
          if (error || !stream) reject(error || new Error('Jump forwarding failed'));
          else resolve(stream);
        });
      });
      const config: any = { sock, username: credential.sshUser || 'root', readyTimeout: 15_000 };
      if (credential.password) config.password = decryptSecret(credential.password);
      if (credential.privateKey) config.privateKey = decryptSecret(credential.privateKey);
      const conn = new Client();
      await new Promise<void>((resolve, reject) => {
        conn.once('ready', () => resolve());
        conn.once('error', reject);
        conn.connect(config);
      });
      return { conn, jump };
    } catch (error) {
      jump.end();
      throw error;
    }
  }

  async request(nodeId: string, target: string, method: string, headers: Record<string, string>, body?: string): Promise<NodeHttpResult> {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Notification URL must be http(s)');
    const { conn, jump } = await this.connect(nodeId);
    try {
      const socket = await new Promise<any>((resolve, reject) => {
        const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
        conn.forwardOut('127.0.0.1', 0, url.hostname, port, (error, stream) => {
          if (error || !stream) reject(error || new Error('Forwarding failed'));
          else resolve(stream);
        });
      });
      const isHttps = url.protocol === 'https:';
      const options: any = {
        method,
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, Host: url.host },
        // A forwarded SSH socket is raw TCP. HTTPS requests must be wrapped in
        // TLS explicitly; passing the raw socket to https.request skips the
        // handshake and sends plaintext to port 443.
        createConnection: () => isHttps ? tls.connect({ socket, servername: url.hostname }) : socket,
        timeout: 8000,
      };
      return await new Promise<NodeHttpResult>((resolve, reject) => {
        const req = (isHttps ? https : http).request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300), status: res.statusCode || 0, text: data.slice(0, 4000) }));
        });
        req.on('timeout', () => req.destroy(new Error('Notification request timeout')));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });
    } finally {
      try { conn.end(); } catch {}
      if (jump) { try { jump.end(); } catch {} }
    }
  }
}
