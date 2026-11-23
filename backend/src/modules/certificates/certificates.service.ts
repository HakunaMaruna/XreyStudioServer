import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentClientService } from '../config/agent-client.service';

const WEBROOT = process.env.ACME_WEBROOT || '/var/www/certbot';
const CERTS_DIR = process.env.CERTS_DIR || '/app/certs';

type IssueResult = { host: string; status: string; agent: any };

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentClient: AgentClientService,
  ) {}

  private hostFor(nodeId: string) {
    const suffix = process.env.NODE_DOMAIN_SUFFIX;
    if (!suffix) throw new BadRequestException('NODE_DOMAIN_SUFFIX is not configured');
    const template = process.env.NODE_DOMAIN_TEMPLATE || 'node-{id}.{suffix}';
    return template.replace('{id}', nodeId).replace('{suffix}', suffix);
  }

  private run(command: string, args: string[], timeout = 120_000): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(stderr?.trim() || error.message));
        else resolve(stdout);
      });
    });
  }

  async status(nodeId: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');
    const host = node.certificateHost || this.hostFor(nodeId);
    const dir = path.join(CERTS_DIR, host);
    const installed = await fs
      .access(path.join(dir, 'fullchain.pem'))
      .then(() => true)
      .catch(() => false);
    return {
      nodeId,
      host,
      installed,
      issuedAt: node.certificateIssuedAt,
      expiresAt: node.certificateExpiresAt,
      httpsUrl: node.certificateHost ? `https://${host}:9090` : null,
    };
  }

  async issue(nodeId: string): Promise<IssueResult> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const host = this.hostFor(nodeId);
    const email = process.env.LE_EMAIL || 'admin@example.com';
    await fs.mkdir(WEBROOT, { recursive: true });

    await this.run('certbot', [
      'certonly',
      '--webroot',
      '-w', WEBROOT,
      '-d', host,
      '--email', email,
      '--agree-tos',
      '--non-interactive',
      '--keep-until-expiring',
      '--cert-name', host,
    ]);

    const live = `/etc/letsencrypt/live/${host}`;
    const certificate = await fs.readFile(path.join(live, 'fullchain.pem'), 'utf8');
    const privateKey = await fs.readFile(path.join(live, 'privkey.pem'), 'utf8');

    const target = path.join(CERTS_DIR, host);
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(target, 'fullchain.pem'), certificate, { mode: 0o600 });
    await fs.writeFile(path.join(target, 'privkey.pem'), privateKey, { mode: 0o600 });

    let agent: any;
    try {
      agent = await this.agentClient.installCertificate(node, {
        certificate,
        privateKey,
        hostname: host,
      });
    } catch (error: any) {
      this.logger.warn(`Certificate issued for ${host} but agent install failed: ${error.message}`);
      agent = { installed: false, error: error.message };
    }

    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        certificateHost: host,
        certificateIssuedAt: new Date(),
        certificateExpiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
        ...(agent.installed === false ? {} : { agentUrl: `https://${host}:9090` }),
      },
    });

    return { host, status: agent.installed === false ? 'issued-not-installed' : 'installed', agent };
  }

  async renewAll() {
    const nodes = await this.prisma.node.findMany({ where: { certificateHost: { not: null } } });
    const results = [];
    for (const node of nodes) {
      try {
        results.push({ nodeId: node.id, ...(await this.issue(node.id)) });
      } catch (error: any) {
        results.push({ nodeId: node.id, status: 'failed', error: error.message });
      }
    }
    return { processed: results.length, results };
  }
}
