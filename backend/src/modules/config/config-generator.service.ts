import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentClientService } from './agent-client.service';

@Injectable()
export class ConfigGeneratorService {
  private readonly logger = new Logger(ConfigGeneratorService.name);

  constructor(
    private prisma: PrismaService,
    private agentClient: AgentClientService,
  ) {}

  private clientFor(user: { id: string; email: string; subscriptionToken: string }, inbound: any) {
    const settings = (inbound.settings || {}) as any;
    switch (inbound.protocol) {
      case 'vless':
        return {
          id: user.id,
          email: user.email,
          flow: settings.flow || '',
        };
      case 'vmess':
        return { id: user.id, email: user.email, alterId: 0 };
      case 'trojan':
        return { password: user.subscriptionToken, email: user.email };
      case 'shadowsocks':
        return { password: user.subscriptionToken, email: user.email, method: settings.method || 'aes-256-gcm' };
      default:
        return { email: user.email };
    }
  }

  private buildStream(inbound: any) {
    const settings = (inbound.settings || {}) as any;
    const stream: any = {
      network: inbound.transport || 'tcp',
      security: inbound.security || 'none',
    };
    if (inbound.transport === 'ws') {
      stream.wsSettings = { path: settings.wsPath || '/ws', headers: settings.wsHeaders || {} };
    }
    if (inbound.transport === 'grpc') {
      stream.grpcSettings = { serviceName: settings.grpcServiceName || 'xss' };
    }
    if (inbound.transport === 'http' || inbound.transport === 'h2') {
      stream.network = 'http';
      stream.httpSettings = { path: settings.httpPath || '/', host: settings.httpHost || [] };
    }
    if (inbound.transport === 'quic') {
      stream.quicSettings = {
        security: settings.quicSecurity || 'none',
        key: settings.quicKey || '',
        header: { type: settings.quicHeader || 'none' },
      };
    }
    if (inbound.security === 'tls') {
      stream.tlsSettings = {
        serverName: settings.serverName || settings.sni || '',
        certificates: settings.certificates || undefined,
        alpn: settings.alpn || ['h2', 'http/1.1'],
      };
    }
    if (inbound.security === 'reality') {
      stream.realitySettings = {
        show: false,
        dest: settings.realityDest || 'www.microsoft.com:443',
        serverNames: settings.realityServerNames || ['www.microsoft.com'],
        privateKey: settings.realityPrivateKey || '',
        shortIds: settings.realityShortIds || [''],
        spiderX: settings.spiderX || '/',
      };
    }
    return stream;
  }

  async generateConfig(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { inbounds: { where: { enabled: true } } },
    });
    if (!node) throw new NotFoundException('Node not found');

    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, email: true, subscriptionToken: true },
    });
    const rules = await this.prisma.rule.findMany({ where: { enabled: true } });

    const inbounds = node.inbounds.map((inbound) => {
      const settings = (inbound.settings || {}) as any;
      const selected = inbound.userId
        ? users.filter((u) => u.id === inbound.userId)
        : users;
      const clients = selected.map((u) => this.clientFor(u, inbound));
      const inboundSettings: any = {
        ...settings,
        clients,
      };
      if (inbound.protocol === 'vless') inboundSettings.decryption = 'none';
      if (inbound.protocol === 'shadowsocks') {
        inboundSettings.method = settings.method || 'aes-256-gcm';
        inboundSettings.network = 'tcp,udp';
      }
      return {
        tag: inbound.tag,
        listen: settings.listen || '0.0.0.0',
        port: inbound.port,
        protocol: inbound.protocol,
        settings: inboundSettings,
        streamSettings: this.buildStream(inbound),
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      };
    });

    const config = {
      log: { loglevel: 'warning' },
      dns: {
        servers: ['1.1.1.1', '8.8.8.8', 'localhost'],
        queryStrategy: 'UseIP',
      },
      inbounds,
      outbounds: [
        { tag: 'direct', protocol: 'freedom' },
        { tag: 'blocked', protocol: 'blackhole' },
      ],
      routing: {
        domainStrategy: 'IPIfNonMatch',
        rules: [
          ...rules.map((r) => r.payload),
          { type: 'field', network: 'tcp,udp', outboundTag: 'direct' },
        ],
      },
      policy: {
        levels: { '0': { handshake: 4, connIdle: 300, uplinkOnly: 2, downlinkOnly: 5 } },
      },
    };

    this.validateConfig(config);
    return { node, config };
  }

  validateConfig(config: any) {
    if (!config || typeof config !== 'object') throw new BadRequestException('Invalid config');
    if (!Array.isArray(config.inbounds)) throw new BadRequestException('inbounds must be an array');
    if (!Array.isArray(config.outbounds)) throw new BadRequestException('outbounds must be an array');
    const tags = new Set<string>();
    for (const inbound of config.inbounds) {
      if (!inbound.tag) throw new BadRequestException('Inbound tag is required');
      if (!inbound.port) throw new BadRequestException('Inbound port is required');
      if (!inbound.protocol) throw new BadRequestException('Inbound protocol is required');
      if (tags.has(inbound.tag)) throw new BadRequestException(`Duplicate tag: ${inbound.tag}`);
      tags.add(inbound.tag);
    }
    return true;
  }

  async createRevision(nodeId: string) {
    const { config } = await this.generateConfig(nodeId);
    const last = await this.prisma.configRevision.findFirst({
      where: { nodeId },
      orderBy: { version: 'desc' },
    });
    return this.prisma.configRevision.create({
      data: {
        nodeId,
        version: (last?.version || 0) + 1,
        content: JSON.stringify(config, null, 2),
      },
    });
  }

  async applyRevision(nodeId: string, revisionId?: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const revision = revisionId
      ? await this.prisma.configRevision.findFirst({ where: { id: revisionId, nodeId } })
      : await this.createRevision(nodeId);
    if (!revision) throw new NotFoundException('Revision not found');

    const content = JSON.parse(revision.content);
    this.validateConfig(content);
    const result = await this.agentClient.applyConfig(node, content, revision.version);
    await this.prisma.$transaction([
      this.prisma.configRevision.updateMany({
        where: { nodeId },
        data: { applied: false },
      }),
      this.prisma.configRevision.update({
        where: { id: revision.id },
        data: { applied: true },
      }),
      this.prisma.node.update({
        where: { id: nodeId },
        data: { lastError: null },
      }),
    ]);
    return { applied: true, revisionId: revision.id, version: revision.version, agent: result };
  }

  async listRevisions(nodeId: string) {
    return this.prisma.configRevision.findMany({
      where: { nodeId },
      orderBy: { version: 'desc' },
      take: 50,
      select: { id: true, version: true, applied: true, createdAt: true },
    });
  }

  async rollback(nodeId: string, revisionId: string) {
    return this.applyRevision(nodeId, revisionId);
  }
}
