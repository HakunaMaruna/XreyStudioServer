import { resolveCname } from 'dns/promises';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { encryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { ControlService } from '../control/control.service';
import { NodeProvisionService } from '../node-provision/node-provision.service';
import { CreateNodeWizardDto } from './dto/wizard.dto';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly control: ControlService,
    private readonly provision: NodeProvisionService,
    private readonly configGenerator: ConfigGeneratorService,
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
    let cnames: string[] = [];
    try {
      cnames = await resolveCname(`_acme-challenge.${domain}`);
    } catch {
      throw new BadRequestException(
        `Add DNS record: _acme-challenge.${domain} CNAME _acme-challenge.${fqdn}`,
      );
    }
    const expected = `_acme-challenge.${fqdn}`.toLowerCase().replace(/\.$/, '');
    if (!cnames.some((name) => name.toLowerCase().replace(/\.$/, '') === expected)) {
      throw new BadRequestException(
        `_acme-challenge.${domain} must point to _acme-challenge.${fqdn}`,
      );
    }
  }

  async create(dto: CreateNodeWizardDto, user: AuthUser) {
    if (dto.authMode !== 'key' && !dto.password) {
      throw new BadRequestException('Password is required for this SSH auth mode');
    }
    if (dto.authMode !== 'password' && !dto.privateKey) {
      throw new BadRequestException('Private key is required for this SSH auth mode');
    }
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR) {
      throw new BadRequestException('Admin or operator role required');
    }

    const domain = await this.allocate(dto, user);
    try {
      if (dto.userDomain) await this.verifyUserDomain(dto.userDomain, domain.fqdn);
    } catch (error) {
      await this.control.release(domain.id, this.context(user)).catch(() => undefined);
      throw error;
    }

    let provisioned: any;
    try {
      provisioned = await this.provision.provision(
        {
          name: dto.nodeName || `${dto.location.toLowerCase()}-${domain.label.slice(0, 6)}`,
          host: dto.host,
          port: dto.sshPort || 443,
          username: dto.sshUser || 'root',
          privateKey: dto.privateKey,
          passphrase: dto.passphrase,
          password: dto.password,
          hostKeyFingerprint: dto.hostKeyFingerprint,
          useSudo: Boolean(dto.sshUser && dto.sshUser !== 'root'),
        } as any,
        user,
      );
    } catch (error: any) {
      await this.control.release(domain.id, this.context(user)).catch(() => undefined);
      throw new ServiceUnavailableException(`Node installation failed: ${error.message}`);
    }

    // Секреты сохраняем только в зашифрованном виде; в ответ и логи не попадают.
    await this.prisma.wizardCredential.create({
      data: {
        nodeId: provisioned.nodeId,
        authMode: dto.authMode,
        password: dto.password ? encryptSecret(dto.password) : null,
        privateKey: dto.privateKey ? encryptSecret(dto.privateKey) : null,
        passphrase: dto.passphrase ? encryptSecret(dto.passphrase) : null,
        userDomain: dto.userDomain || null,
      },
    }).catch((error) => this.logger.warn(`Failed to store credentials: ${error.message}`));

    const port = Number(process.env.WIZARD_INBOUND_PORT || 443);
    const inbound = await this.prisma.inbound.create({
      data: {
        tag: `wizard-${domain.label}`,
        nodeId: provisioned.nodeId,
        protocol: 'vless',
        transport: 'tcp',
        security: 'tls',
        port,
        listen: '0.0.0.0',
        sni: domain.fqdn,
        settings: { publicHost: domain.fqdn, sni: domain.fqdn },
        enabled: true,
      },
    });

    await this.control.bindNode(domain.id, provisioned.nodeId, this.context(user)).catch(() => undefined);
    const revision = await this.configGenerator.createRevision(provisioned.nodeId);

    let certificate: any = null;
    try {
      certificate = await this.control.issueCertificate(
        domain.id,
        this.context(user),
        dto.userDomain ? [dto.userDomain] : [],
      );
    } catch (error: any) {
      this.logger.warn(`Certificate issuance pending: ${error.message}`);
    }

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
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId: domain.nodeId || '' } });
    const extra = credential?.userDomain ? [credential.userDomain] : [];
    const certificate = await this.control.issueCertificate(domainId, this.context(user), extra);
    return { fqdn: certificate.fqdn, domains: certificate.domains, certificateIssued: true };
  }
}
