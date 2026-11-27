// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { resolveCname } from 'dns/promises';
import { Resolver } from 'dns';
import { promisify } from 'util';
import { generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { encryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { AgentClientService } from '../config/agent-client.service';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { ControlService } from '../control/control.service';
import { NodeProvisionService } from '../node-provision/node-provision.service';
import { CreateNodeWizardDto } from './dto/wizard.dto';
import { UpdateWizardNodeDto } from './dto/update-wizard-node.dto';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly control: ControlService,
    private readonly provision: NodeProvisionService,
    private readonly configGenerator: ConfigGeneratorService,
    private readonly agent: AgentClientService,
  ) {}

  private context(user: AuthUser): ApiTokenContext {
    return {
      tokenId: 'wizard',
      userId: user.userId,
      role: user.role as Role,
      organizationId: user.organizationId || null,
      scopes: ['NODE_DOMAIN' as any],
    };
  }

  /** Xray x25519 keys are raw 32 bytes encoded as base64url, same as `xray x25519`. */
  private realityKeys() {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    const raw = (key: any, type: 'spki' | 'pkcs8') =>
      key.export({ format: 'der', type }).subarray(-32).toString('base64url');
    return {
      privateKey: raw(privateKey, 'pkcs8'),
      publicKey: raw(publicKey, 'spki'),
      shortId: randomBytes(8).toString('hex'),
    };
  }

  private async resolveA(host: string): Promise<string[]> {
    const resolver = new Resolver();
    const servers = (process.env.NODE_DNS_RESOLVERS || '1.1.1.1,8.8.8.8')
      .split(',').map((item) => item.trim()).filter(Boolean);
    if (servers.length) resolver.setServers(servers);
    return await promisify(resolver.resolve4).call(resolver, host) as string[];
  }

  private async assertDns(fqdn: string, ipv4: string) {
    const addresses = await this.resolveA(fqdn).catch(() => [] as string[]);
    if (!addresses.includes(ipv4)) {
      throw new BadRequestException(
        `DNS for ${fqdn} does not point to ${ipv4}. Add an A record and retry (get ${addresses.join(', ') || 'no A record'}).`,
      );
    }
  }

  private async allocate(dto: CreateNodeWizardDto, user: AuthUser) {
    const url = (process.env.CONTROL_API_URL || '').replace(/\/$/, '');
    const token = process.env.CONTROL_TENANT_TOKEN || '';
    const body = {
      ipv4: dto.ipv4 || dto.host,
      ipv6: dto.ipv6,
      location: dto.location,
      nodeName: dto.nodeName || dto.host,
    };
    if (!url || !token) return this.control.allocate(body, this.context(user));
    const response = await fetch(`${url}/api/control/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new BadRequestException(`CONTROL rejected domain request: ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
  }

  // Пользовательский домен вне нашей зоны: сертификат выпускаем с DNS-01,
  // для этого _acme-challenge пользователя должен быть CNAME на нашу зону.
  private async verifyUserDomain(domain: string, fqdn: string) {
    const cnames = await resolveCname(`_acme-challenge.${domain}`).catch(() => {
      throw new BadRequestException(
        `Add DNS record: _acme-challenge.${domain} CNAME _acme-challenge.${fqdn}`,
      );
    });
    const expected = `_acme-challenge.${fqdn}`.toLowerCase().replace(/\.$/, '');
    if (!cnames.some((name) => name.toLowerCase().replace(/\.$/, '') === expected)) {
      throw new BadRequestException(
        `_acme-challenge.${domain} must point to _acme-challenge.${fqdn}`,
      );
    }
  }

  private async report(
    installId: string,
    stage: string,
    message: string,
    progress?: number,
    level = 'info',
  ) {
    await this.prisma.nodeInstallLog.create({
      data: { installId, stage, level, message: String(message).slice(0, 4000) },
    }).catch(() => undefined);
    if (progress !== undefined) {
      await this.prisma.nodeInstallJob.update({
        where: { installId },
        data: { stage, progress },
      }).catch(() => undefined);
    }
  }

  /** Progress/status of one installation, polled by the wizard UI. */
  async installation(installId: string, user: AuthUser) {
    const job = await this.prisma.nodeInstallJob.findUnique({
      where: { installId },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Installation not found');
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR && job.userId !== user.userId) {
      throw new ForbiddenException('Installation belongs to another user');
    }
    return job;
  }

  async create(dto: CreateNodeWizardDto, user: AuthUser) {
    let installId = dto.installId || randomUUID();
    const jobData = () => ({
      installId,
      status: 'running',
      stage: 'start',
      progress: 2,
      userId: user.userId,
      organizationId: user.organizationId || null,
    });
    await this.prisma.nodeInstallJob.create({ data: jobData() }).catch(async () => {
      // A client-supplied id may collide with an older job; never write into someone else's job.
      installId = randomUUID();
      await this.prisma.nodeInstallJob.create({ data: jobData() });
    });
    const report = (stage: string, message: string, progress?: number, level?: string) =>
      this.report(installId, stage, message, progress, level);
    await report('start', 'Installation started', 2);
    try {
      const result = await this.createInternal(dto, user, installId, report);
      await report('done', 'Installation completed', 100);
      await this.prisma.nodeInstallJob.update({
        where: { installId },
        data: { status: 'success', stage: 'done', progress: 100, nodeId: result.nodeId, error: null },
      }).catch(() => undefined);
      return { ...result, installId };
    } catch (error: any) {
      await report('error', error?.message || 'Installation failed', undefined, 'error');
      await this.prisma.nodeInstallJob.update({
        where: { installId },
        data: { status: 'failed', error: String(error?.message || error).slice(0, 1000) },
      }).catch(() => undefined);
      throw error;
    }
  }

  private async createInternal(
    dto: CreateNodeWizardDto,
    user: AuthUser,
    installId: string,
    report: (stage: string, message: string, progress?: number, level?: string) => Promise<void>,
  ) {
    if (dto.authMode !== 'key' && !dto.password) {
      throw new BadRequestException('Password is required for this SSH auth mode');
    }
    if (dto.authMode !== 'password' && !dto.privateKey) {
      throw new BadRequestException('Private key is required for this SSH auth mode');
    }
    if (dto.authMode !== 'password' && !dto.hostKeyFingerprint) {
      throw new BadRequestException('SSH host key fingerprint is required for key-based auth');
    }
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR) {
      throw new BadRequestException('Admin or operator role required');
    }

    await report('domain', 'Requesting a domain from CONTROL…', 8);
    const domain = await this.allocate(dto, user);
    await report('domain', `Domain allocated: ${domain.fqdn}`, 15);
    await report('domain', `Checking DNS for ${domain.fqdn}…`, 18);
    await this.assertDns(domain.fqdn, dto.ipv4 || dto.host);
    await report('domain', 'DNS confirmed', 20);
    const includeCustomCert = dto.issueCustomCert !== false;
    try {
      if (dto.userDomain && includeCustomCert) {
        await report('domain', 'Verifying DNS CNAME for the user domain…', 20);
        await this.verifyUserDomain(dto.userDomain, domain.fqdn);
        await report('domain', 'DNS CNAME verified', 23);
      } else if (dto.userDomain && !includeCustomCert) {
        await report('domain', 'Custom domain kept without a certificate; using the allocated domain for TLS', 23, 'warn');
      }
    } catch (error) {
      await this.control.release(domain.id, this.context(user)).catch(() => undefined);
      throw error;
    }

    if (dto.jumpNodeId) {
      const jumpNode = await this.prisma.node.findFirst({
        where: { id: dto.jumpNodeId, ...(user.role === Role.ADMIN ? {} : { organizationId: user.organizationId || null }) },
        select: { id: true, name: true },
      });
      if (!jumpNode) throw new BadRequestException('Jump node not found in your organization');
      await report('ssh', `Using jump node: ${jumpNode.name}`, 28);
    }
    let provisioned: any;
    await report('ssh', 'Starting SSH provisioning…', 28);
    try {
      provisioned = await this.provision.provision(
        {
          name: dto.nodeName || `${dto.location.toLowerCase()}-${domain.label.slice(0, 6)}`,
          host: dto.host,
          port: dto.sshPort || 22,
          username: dto.sshUser || 'root',
          privateKey: dto.privateKey,
          passphrase: dto.passphrase,
          password: dto.password,
          hostKeyFingerprint: dto.hostKeyFingerprint,
          location: dto.location,
          jumpNodeId: dto.jumpNodeId,
          useSudo: Boolean(dto.sshUser && dto.sshUser !== 'root'),
        } as any,
        user,
        (stage: string, message: string, level = 'info') => {
          const STAGE_PROGRESS: Record<string, number> = { ssh: 32, prepare: 42, env: 55, install: 65 };
          return report(stage, message, level === 'output' ? undefined : STAGE_PROGRESS[stage], level);
        },
      );
    } catch (error: any) {
      await this.control.release(domain.id, this.context(user)).catch(() => undefined);
      const hint = error.message.includes('SSH provisioning is disabled')
        ? 'Enable SSH_PROVISION_ENABLED=true on the panel (docker-compose.control.yml sets it by default).'
        : error.message;
      throw new ServiceUnavailableException(`Node installation failed: ${hint}`);
    }

    await report('credentials', 'Storing encrypted SSH credentials', 75);
    // Секреты сохраняем только в зашифрованном виде; в ответ и логи не попадают.
    await this.prisma.wizardCredential.create({
      data: {
        nodeId: provisioned.nodeId,
        authMode: dto.authMode,
        sshHost: dto.host,
        sshUser: dto.sshUser || 'root',
        sshPort: dto.sshPort || 22,
        location: dto.location,
        nodeName: dto.nodeName || null,
        ipv4: dto.ipv4 || null,
        ipv6: dto.ipv6 || null,
        password: dto.password ? encryptSecret(dto.password) : null,
        privateKey: dto.privateKey ? encryptSecret(dto.privateKey) : null,
        passphrase: dto.passphrase ? encryptSecret(dto.passphrase) : null,
        userDomain: dto.userDomain || null,
      },
    }).catch((error) => this.logger.warn(`Failed to store credentials: ${error.message}`));

    await report('inbound', 'Creating VLESS TLS inbound', 82);
    const port = Number(process.env.WIZARD_INBOUND_PORT || 443);
    let security = 'reality';
    if (!domain.fqdn) {
      if (process.env.WIZARD_REALITY_FALLBACK === 'true') {
        security = 'tls';
        this.logger.warn('Node domain is missing; falling back to legacy VLESS TLS inbound');
        await report('inbound', 'Domain missing — using legacy TLS inbound', 82, 'warn');
      } else {
        throw new BadRequestException('Node domain is required for the default Reality inbound');
      }
    }
    const reality = security === 'reality' ? this.realityKeys() : null;
    const decoyPort = Number(process.env.WIZARD_DECOY_PORT || 8443);
    const inbound = await this.prisma.inbound.create({
      data: {
        tag: `wizard-${domain.label}`,
        nodeId: provisioned.nodeId,
        protocol: 'vless',
        transport: 'tcp',
        security,
        port,
        listen: '0.0.0.0',
        flow: security === 'reality' ? 'xtls-rprx-vision' : null,
        sni: domain.fqdn,
        settings: security === 'reality' ? {
          publicHost: domain.fqdn,
          sni: domain.fqdn,
          flow: 'xtls-rprx-vision',
          // selfSNI: Reality mimics our own node domain; unknown probes hit the local decoy site.
          realityDest: `${process.env.WIZARD_DECOY_HOST || '127.0.0.1'}:${decoyPort}`,
          realityServerNames: [domain.fqdn],
          realityPrivateKey: reality?.privateKey,
          realityPublicKey: reality?.publicKey,
          realityShortIds: reality ? [reality.shortId] : [],
          realityFingerprint: 'chrome',
          spiderX: '/',
        } : {
          publicHost: domain.fqdn,
          sni: domain.fqdn,
          fallbackDest: Number(process.env.NODE_STUB_PORT || 18080),
          fallbackAlpn: 'http/1.1',
        },
        enabled: true,
      },
    });

    await report('bind', 'Binding node to domain', 90);
    await this.control.bindNode(domain.id, provisioned.nodeId, this.context(user)).catch(() => undefined);

    await report('cert', 'Requesting TLS certificate…', 95);
    let certificate: any = null;
    try {
      certificate = await this.control.issueCertificate(
        domain.id,
        this.context(user),
        dto.userDomain && includeCustomCert ? [dto.userDomain] : [],
      );
    } catch (error: any) {
      this.logger.warn(`Certificate issuance pending: ${error.message}`);
      await report('cert', `Certificate pending: ${error.message}`, 95, 'warn');
    }
    if (certificate && security === 'reality' && dto.jumpNodeId) {
      await report('cert', 'Jump node used — agent will use its bundled decoy certificate', 97, 'warn');
    } else if (certificate && security === 'reality') {
      await report('cert', 'Waiting for the agent before installing the decoy certificate', 97);
      let agentReady = false;
      const agentNode = await this.prisma.node.findUnique({ where: { id: provisioned.nodeId } });
      const agentTarget = agentNode
        ? { address: agentNode.address, agentUrl: agentNode.agentUrl, agentSecret: agentNode.agentSecret }
        : { address: dto.host, agentUrl: provisioned.agentUrl };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const ping = await this.agent.ping(agentTarget);
        if (ping.reachable) { agentReady = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (!agentReady) {
        await report('cert', 'Agent did not become reachable; decoy certificate was not installed', 97, 'warn');
      } else {
        await report('cert', 'Installing decoy site certificate on the node', 97);
        try {
          await this.agent.installDecoyCertificate(
            agentTarget,
            { certificate: certificate.certificate, privateKey: certificate.privateKey, hostname: domain.fqdn },
          );
        } catch (error: any) {
          await report('cert', `Decoy certificate install failed: ${error.message}`, 97, 'warn');
        }
      }
    }
    const revision = await this.configGenerator.createRevision(provisioned.nodeId);

    return {
      nodeId: provisioned.nodeId,
      nodeName: provisioned.name,
      fqdn: domain.fqdn,
      domainId: domain.id,
      userDomain: dto.userDomain || null,
      inboundId: inbound.id,
      inboundPort: port,
      revision: revision.version,
      certificateIssued: Boolean(certificate),
      domains: certificate?.domains || [domain.fqdn],
      next: certificate
        ? 'Apply the configuration on the node to activate VLESS TLS.'
        : 'Certificate pending DNS propagation — retry after the node is ONLINE.',
    };
  }

  private async assertNodeAccess(nodeId: string, user: AuthUser) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');
    if (user.role !== Role.ADMIN && node.organizationId !== user.organizationId) {
      throw new ForbiddenException('Node belongs to another organization');
    }
    return node;
  }

  // Параметры мастера, доступные для редактирования. Секреты никогда не возвращаются.
  async getNodeParams(nodeId: string, user: AuthUser) {
    const node = await this.assertNodeAccess(nodeId, user);
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId } });
    return {
      id: node.id,
      name: node.name,
      address: node.address,
      location: node.location || credential?.location || null,
      authMode: credential?.authMode || 'key',
      sshHost: credential?.sshHost || node.address,
      sshUser: credential?.sshUser || 'root',
      sshPort: credential?.sshPort || 22,
      ipv4: credential?.ipv4 || null,
      ipv6: credential?.ipv6 || null,
      userDomain: credential?.userDomain || null,
      hasPassword: Boolean(credential?.password),
      hasPrivateKey: Boolean(credential?.privateKey),
      hasPassphrase: Boolean(credential?.passphrase),
      createdAt: credential?.createdAt || null,
    };
  }

  async updateNodeParams(nodeId: string, dto: UpdateWizardNodeDto, user: AuthUser) {
    await this.assertNodeAccess(nodeId, user);
    const nodeData: Record<string, unknown> = {};
    if (dto.name !== undefined) nodeData.name = dto.name;
    if (dto.address !== undefined) nodeData.address = dto.address;
    if (dto.location !== undefined) nodeData.location = dto.location;
    if (Object.keys(nodeData).length) {
      await this.prisma.node.update({ where: { id: nodeId }, data: nodeData as any });
    }

    const credentialData: Record<string, unknown> = {};
    for (const key of ['authMode', 'sshUser', 'sshPort', 'location', 'ipv4', 'ipv6', 'userDomain'] as const) {
      if (dto[key] !== undefined) credentialData[key] = dto[key];
    }
    if (dto.address !== undefined) credentialData.sshHost = dto.address;
    if (dto.password) credentialData.password = encryptSecret(dto.password);
    if (dto.privateKey) credentialData.privateKey = encryptSecret(dto.privateKey);
    if (dto.passphrase) credentialData.passphrase = encryptSecret(dto.passphrase);

    if (Object.keys(credentialData).length) {
      await this.prisma.wizardCredential.upsert({
        where: { nodeId },
        create: { nodeId, authMode: 'key', ...credentialData } as any,
        update: credentialData as any,
      });
    }
    return this.getNodeParams(nodeId, user);
  }

  async listCredentials() {
    const rows = await this.prisma.wizardCredential.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      nodeId: row.nodeId,
      authMode: row.authMode,
      hasPassword: Boolean(row.password),
      hasPrivateKey: Boolean(row.privateKey),
      hasPassphrase: Boolean(row.passphrase),
      createdAt: row.createdAt,
    }));
  }

  async removeCredentials(nodeId: string) {
    await this.prisma.wizardCredential.deleteMany({ where: { nodeId } });
    return { removed: true };
  }

  async retryCertificate(domainId: string, user: AuthUser) {
    const domain = await this.prisma.nodeDomain.findFirst({
      where: { id: domainId, tenantOrgId: this.context(user).organizationId },
    });
    if (!domain) throw new BadRequestException('Node domain not found');
    const node = await this.prisma.node.findFirst({
      where: {
        id: domain.nodeId || '',
        ...(user.role === Role.ADMIN ? {} : { organizationId: user.organizationId || null }),
      },
    });
    if (!node) throw new BadRequestException('Node not found in this tenant');
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId: domain.nodeId || '' } });
    const extra = credential?.userDomain ? [credential.userDomain] : [];
    const certificate = await this.control.issueCertificate(domainId, this.context(user), extra);
    return { fqdn: certificate.fqdn, domains: certificate.domains, certificateIssued: true };
  }
}
