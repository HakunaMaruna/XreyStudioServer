import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { PowerDnsService } from './powerdns.service';

export type AllocateDto = { ipv4: string; ipv6?: string; location?: string; nodeName?: string };

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

@Injectable()
export class ControlService {
  private readonly logger = new Logger(ControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dns: PowerDnsService,
  ) {}

  private tenantId(ctx: ApiTokenContext) {
    return ctx.organizationId || null;
  }

  async allocate(dto: AllocateDto, ctx: ApiTokenContext) {
    if (!IPV4.test(dto.ipv4 || '')) throw new BadRequestException('Invalid IPv4 address');
    if (dto.ipv6 && !IPV6.test(dto.ipv6)) throw new BadRequestException('Invalid IPv6 address');
    if (!(await this.dns.isConfigured())) throw new BadRequestException('CONTROL DNS is not configured (PDNS_API_KEY missing)');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const label = randomBytes(6).toString('hex');
      const fqdn = `${label}.${await this.dns.zoneName()}`;
      const exists = await this.prisma.nodeDomain.findUnique({ where: { label } });
      if (exists) continue;
      await this.dns.setAddress(label, dto.ipv4, dto.ipv6);
      return this.prisma.nodeDomain.create({
        data: {
          label,
          fqdn,
          tenantOrgId: this.tenantId(ctx),
          address: dto.ipv4,
          ipv6: dto.ipv6,
          location: dto.location,
        },
      });
    }
    throw new BadRequestException('Could not allocate a unique node label');
  }

  async list(ctx: ApiTokenContext) {
    return this.prisma.nodeDomain.findMany({
      where: { tenantOrgId: this.tenantId(ctx), releasedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async release(id: string, ctx: ApiTokenContext) {
    const domain = await this.prisma.nodeDomain.findFirst({ where: { id, tenantOrgId: this.tenantId(ctx) } });
    if (!domain) throw new NotFoundException('Node domain not found');
    await this.dns.remove(domain.label);
    return this.prisma.nodeDomain.update({ where: { id }, data: { releasedAt: new Date() } });
  }

  async bindNode(id: string, nodeId: string, ctx: ApiTokenContext) {
    const domain = await this.prisma.nodeDomain.findFirst({ where: { id, tenantOrgId: this.tenantId(ctx) } });
    if (!domain) throw new NotFoundException('Node domain not found');
    return this.prisma.nodeDomain.update({ where: { id }, data: { nodeId } });
  }

  // ACME DNS-01: хуки проверяют и удаляют TXT-запись через PowerDNS API.
  // Для домена пользователя требуется CNAME _acme-challenge.<user-domain> →
  // _acme-challenge.<label>.<zone>, поэтому все вызовы пишут TXT в нашей зоне.
  async issueCertificate(domainId: string, ctx: ApiTokenContext, extraDomains: string[] = []) {
    const domain = await this.prisma.nodeDomain.findFirst({ where: { id: domainId, tenantOrgId: this.tenantId(ctx) } });
    if (!domain) throw new NotFoundException('Node domain not found');
    if (!(await this.dns.isConfigured())) throw new BadRequestException('CONTROL DNS is not configured');

    const names = [domain.fqdn, ...extraDomains.filter((name) => name && name !== domain.fqdn)];
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xss-acme-'));
    const hookScript = `#!/usr/bin/env node
const zone = process.env.PDNS_ZONE;
const label = process.env.CERTBOT_LABEL;
const validation = process.env.CERTBOT_VALIDATION;
const change = process.env.PDNS_CHANGETYPE;
const record = '_acme-challenge.' + label + '.' + zone + '.';
const rrsets = [{
  name: record,
  type: 'TXT',
  ttl: 60,
  changetype: change,
  records: change === 'REPLACE' ? [{ content: '"' + validation + '"', disabled: false }] : [],
}];
fetch(process.env.PDNS_API_URL + '/api/v1/servers/localhost/zones/' + zone, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PDNS_API_KEY },
  body: JSON.stringify({ rrsets }),
})
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
`;
    const hook = path.join(dir, 'hook.mjs');
    await fs.writeFile(hook, hookScript, { mode: 0o700 });
    const [pdnsUrl, pdnsKey, pdnsZone] = await Promise.all([
      this.dns.apiUrl(), this.dns.apiKey(), this.dns.zoneName(),
    ]);
    const shellHook = (change: string) => `#!/bin/sh
set -e
PDNS_API_URL='${pdnsUrl}' PDNS_API_KEY='${pdnsKey}' PDNS_ZONE='${pdnsZone}' \\
PDNS_CHANGETYPE='${change}' CERTBOT_LABEL='${domain.label}' node '${hook}'
${change === 'REPLACE' ? 'sleep 5' : ''}
`;
    const auth = path.join(dir, 'auth.sh');
    const cleanup = path.join(dir, 'cleanup.sh');
    await fs.writeFile(auth, shellHook('REPLACE'), { mode: 0o700 });
    await fs.writeFile(cleanup, shellHook('DELETE'), { mode: 0o700 });

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          'certbot',
          [
            'certonly', '--manual', '--preferred-challenges', 'dns-01',
            '--manual-auth-hook', auth,
            '--manual-cleanup-hook', cleanup,
            ...names.flatMap((name) => ['-d', name]),
            '--email', process.env.LE_EMAIL || 'admin@example.com',
            '--agree-tos', '--non-interactive', '--keep-until-expiring',
            '--cert-name', domain.fqdn,
          ],
          { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
          (error, _stdout, stderr) => {
            if (!error) { resolve(); return; }
            const raw = String(stderr || error.message || '').trim();
            const acmeDetail = raw.match(/"detail"\s*:\s*"([^"]+)"/)?.[1];
            const detail = (acmeDetail || raw).split('\n').slice(-3).join(' ').slice(0, 600);
            const hint = /query timed out|NXDOMAIN|SERVFAIL|dns/i.test(detail)
              ? ` Ensure ${pdnsZone} is delegated to this CONTROL server (NS + glue records) and UDP/TCP 53 are reachable.`
              : '';
            reject(new ServiceUnavailableException(`Certificate issuance failed: ${detail}${hint}`));
          },
        );
      });
      const live = `/etc/letsencrypt/live/${domain.fqdn}`;
      const certificate = await fs.readFile(path.join(live, 'fullchain.pem'), 'utf8');
      const privateKey = await fs.readFile(path.join(live, 'privkey.pem'), 'utf8');
      return { fqdn: domain.fqdn, domains: names, certificate, privateKey };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
