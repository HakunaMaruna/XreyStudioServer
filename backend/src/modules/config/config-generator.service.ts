import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgentClientService } from './agent-client.service';
import { BalancersService } from '../balancers/balancers.service';
import { DnsProfilesService } from '../dns-profiles/dns-profiles.service';

const EXTERNAL_PROTOCOLS = ['hysteria2', 'tuic', 'wireguard'];

@Injectable()
export class ConfigGeneratorService {
  private readonly logger = new Logger(ConfigGeneratorService.name);

  constructor(
    private prisma: PrismaService,
    private agentClient: AgentClientService,
    private notifications: NotificationsService,
    private balancers: BalancersService,
    private dnsProfiles: DnsProfilesService,
  ) {}

  private clientFor(user: { id: string; email: string; subscriptionToken: string }, inbound: any) {
    const settings = (inbound.settings || {}) as any;
    switch (inbound.protocol) {
      case 'vless':
        return {
          id: user.id,
          email: user.email,
          flow: inbound.flow || settings.flow || '',
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
    if (inbound.transport === 'ws' || inbound.transport === 'xhttp') {
      stream.wsSettings = { path: inbound.path || settings.wsPath || '/ws', headers: { Host: inbound.sni || '', ...(settings.wsHeaders || {}) } };
    }
    if (inbound.transport === 'grpc') {
      stream.grpcSettings = { serviceName: inbound.serviceName || settings.grpcServiceName || 'xss' };
    }
    if (inbound.transport === 'http' || inbound.transport === 'h2' || inbound.transport === 'httpupgrade' || inbound.transport === 'xhttp') {
      stream.network = inbound.transport === 'xhttp' ? 'xhttp' : 'http';
      stream.httpSettings = { path: inbound.path || settings.httpPath || '/', host: inbound.sni ? [inbound.sni] : settings.httpHost || [] };
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
        serverName: inbound.sni || settings.serverName || settings.sni || '',
        certificates: settings.certificates || undefined,
        // Xray fallbacks require ALPN http/1.1 on the inbound TLS settings.
        alpn: settings.alpn || (settings.fallbackDest ? ['http/1.1'] : ['h2', 'http/1.1']),
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

  private buildSingbox(inbounds: any[], users: any[]) {
    return {
      log: { level: 'warn' },
      inbounds: inbounds.map((inbound) => {
        const settings = (inbound.settings || {}) as any;
        const selected = inbound.userId
          ? users.filter((u) => u.id === inbound.userId)
          : users;
        const base = {
          type: inbound.protocol,
          tag: inbound.tag,
          listen: settings.listen || '::',
          listen_port: inbound.port,
        };
        if (inbound.protocol === 'hysteria2') {
          return {
            ...base,
            users: selected.map((u) => ({ name: u.email, password: u.subscriptionToken })),
            tls: {
              enabled: true,
              certificate_path: settings.certPath || '/etc/sing-box/cert.pem',
              key_path: settings.keyPath || '/etc/sing-box/key.pem',
            },
          };
        }
        if (inbound.protocol === 'tuic') {
          return {
            ...base,
            users: selected.map((u) => ({
              name: u.email,
              uuid: u.id,
              password: u.subscriptionToken,
            })),
            congestion_control: settings.congestionControl || 'cubic',
            tls: {
              enabled: true,
              certificate_path: settings.certPath || '/etc/sing-box/cert.pem',
              key_path: settings.keyPath || '/etc/sing-box/key.pem',
            },
          };
        }
        return {
          ...base,
          private_key: settings.privateKey || '',
          peers: settings.peers || [],
        };
      }),
      outbounds: [{ type: 'direct', tag: 'direct' }],
    };
  }

  async generateConfig(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        inbounds: {
          where: { enabled: true },
          include: {
            fallbacks: { include: { child: { select: { tag: true } } } },
            clients: true,
          },
        },
      },
    });
    if (!node) throw new NotFoundException('Node not found');

    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        // A node must only receive clients from its own tenant.
        organizationId: node.organizationId || null,
      },
      select: { id: true, email: true, subscriptionToken: true, trafficUsed: true, configProfileId: true },
    });
    const inboundTags = new Map<string, string>(
      node.inbounds.filter((i: any) => i.enabled).map((i: any) => [i.id, i.tag]),
    );
    const rules = await this.prisma.rule.findMany({
      where: {
        enabled: true,
        OR: [{ organizationId: null }, ...(node.organizationId ? [{ organizationId: node.organizationId }] : [])],
      },
    });

    const reverseTunnels = await this.prisma.reverseTunnel.findMany({
      where: {
        enabled: true,
        OR: [{ nodeId }, { portalInbound: { nodeId } }],
      },
      include: { portalInbound: true },
    });

    const reverseClientsByInbound = new Map<string, Record<string, unknown>[]>();
    const reverseInbounds: Record<string, unknown>[] = [];
    const reverseOutbounds: Record<string, unknown>[] = [];
    const reverseRules: Record<string, unknown>[] = [];

    for (const tunnel of reverseTunnels) {
      const short = tunnel.id.slice(0, 8);
      if (tunnel.nodeId === nodeId) {
        const inbound = tunnel.portalInbound;
        const settings = (inbound.settings || {}) as any;
        const streamSettings: Record<string, unknown> = { network: inbound.transport || 'tcp' };
        if (inbound.security === 'reality') {
          streamSettings.security = 'reality';
          // Клиентская REALITY-конфигурация: только outbound-поля.
          streamSettings.realitySettings = {
            serverName: (settings.realityServerNames || ['www.microsoft.com'])[0] || 'www.microsoft.com',
            fingerprint: 'chrome',
            password: settings.realityPublicKey || '',
            shortId: (settings.realityShortIds || [''])[0] || '',
            spiderX: '/',
          };
        } else if (inbound.security === 'tls') {
          streamSettings.security = 'tls';
          streamSettings.tlsSettings = { serverName: inbound.sni || settings.publicHost || '', alpn: ['h2', 'http/1.1'] };
        }
        reverseOutbounds.push({
          tag: `rev-${short}-bridge`,
          protocol: 'vless',
          settings: {
            address: settings.publicHost || inbound.sni || '',
            port: inbound.port,
            id: tunnel.bridgeUuid,
            encryption: 'none',
            flow: settings.flow || 'xtls-rprx-vision',
            reverse: { tag: `rev-${short}-in` },
          },
          streamSettings,
        });
        reverseOutbounds.push({
          tag: `rev-${short}-direct`,
          protocol: 'freedom',
          settings: {
            redirect: `${tunnel.internalAddress}:${tunnel.internalPort}`,
            finalRules: [{
              action: 'allow', network: 'tcp,udp',
              ip: [tunnel.internalAddress], port: String(tunnel.internalPort),
            }],
          },
        });
        reverseRules.push({ type: 'field', inboundTag: [`rev-${short}-in`], outboundTag: `rev-${short}-direct` });
        continue;
      }
      if (tunnel.portalInbound?.nodeId === nodeId) {
        const clients = reverseClientsByInbound.get(tunnel.portalInboundId) || [];
        clients.push({ id: tunnel.bridgeUuid, flow: ((tunnel.portalInbound.settings as any)?.flow) || 'xtls-rprx-vision', reverse: { tag: `rev-${short}-out` } });
        reverseClientsByInbound.set(tunnel.portalInboundId, clients);
        reverseInbounds.push({
          tag: `rev-${short}-portal`,
          listen: '0.0.0.0',
          port: tunnel.publicPort,
          protocol: 'dokodemo-door',
          settings: { address: tunnel.reverseDomain, port: tunnel.internalPort, network: 'tcp,udp' },
        });
        reverseRules.push({ type: 'field', inboundTag: [`rev-${short}-portal`], outboundTag: `rev-${short}-out` });
      }
    }

    const chainHops = await this.prisma.proxyChainHop.findMany({
      where: { nodeId, role: 'exit' },
      include: { chain: true },
    });
    const chainRules: Record<string, unknown>[] = [];
    for (const hop of chainHops) {
      const chain = hop.chain as any;
      if (chain?.status !== 'active' || chain.routingMode !== 'rules' || !Array.isArray(chain.routingRules)) continue;
      const tag = `chain-${chain.id.slice(0, 8)}-${hop.id.slice(0, 8)}`;
      for (const rule of chain.routingRules as Record<string, unknown>[]) {
        chainRules.push({ ...rule, inboundTag: [tag] });
      }
    }

    const externalInbounds = node.inbounds.filter((i) => EXTERNAL_PROTOCOLS.includes(i.protocol));
    const xrayInbounds = node.inbounds.filter((i) => !EXTERNAL_PROTOCOLS.includes(i.protocol));

    const inbounds = xrayInbounds.map((inbound) => {
      const settings = (inbound.settings || {}) as any;
      if (['socks', 'http', 'mixed', 'dokodemo-door'].includes(inbound.protocol)) {
        const selected = inbound.userId
          ? users.filter((u) => u.id === inbound.userId)
          : users;
        return {
          tag: inbound.tag,
          listen: inbound.listen || settings.listen || '0.0.0.0',
          port: inbound.port,
          protocol: inbound.protocol === 'http' ? 'http' : inbound.protocol === 'mixed' ? 'mixed' : inbound.protocol === 'dokodemo-door' ? 'dokodemo-door' : 'socks',
          settings: {
            ...settings,
            auth: 'password',
            accounts: selected.map((u) => ({ user: u.email, pass: u.subscriptionToken })),
            ...(inbound.protocol === 'mixed' ? { udp: true } : {}),
            ...(inbound.protocol === 'dokodemo-door' ? { address: settings.forwardAddress || '0.0.0.0', port: settings.forwardPort || inbound.port, network: 'tcp,udp' } : {}),
          },
          sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
        };
      }
      const selected = inbound.userId
        ? users.filter((u) => u.id === inbound.userId)
        : users;
      const limits = new Map((inbound.clients || []).map((c) => [c.userId, c]));
      const active = selected.filter((u) => {
        const limit = limits.get(u.id);
        if (!limit) return true;
        if (limit.enabled === false) return false;
        if (limit.expiresAt && new Date(limit.expiresAt).getTime() < Date.now()) return false;
        if (limit.trafficLimit > 0n && u.trafficUsed >= limit.trafficLimit) return false;
        return true;
      });
      const clients = active.map((u) => this.clientFor(u, inbound));
      const inboundSettings: any = {
        ...settings,
        clients: [...clients, ...(reverseClientsByInbound.get(inbound.id) || [])],
      };
      if (inbound.protocol === 'vless') inboundSettings.decryption = 'none';
      if (inbound.expiresAt && new Date(inbound.expiresAt).getTime() < Date.now()) inboundSettings.clients = [];
      if (inbound.protocol === 'shadowsocks') {
        inboundSettings.method = settings.method || 'aes-256-gcm';
        inboundSettings.network = 'tcp,udp';
      }
      return {
        tag: inbound.tag,
        listen: inbound.listen || settings.listen || '0.0.0.0',
        port: inbound.port,
        protocol: inbound.protocol,
        settings: inboundSettings,
        streamSettings: this.buildStream(inbound),
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
        // Xray FallbackObject entries can point at a port or a tagged inbound.
        // Wizard-created inbounds use a loopback decoy site (anti-DPI) by default.
        ...((settings.fallbackDest || (inbound.fallbacks || []).length)
          ? {
              fallback: [
                ...(settings.fallbackDest
                  ? [{
                      dest: Number(settings.fallbackDest),
                      alpn: settings.fallbackAlpn || 'http/1.1',
                      path: settings.fallbackPath || undefined,
                    }]
                  : []),
                ...(inbound.fallbacks || []).map((f) => ({
                  tag: f.child?.tag,
                  path: f.path || undefined,
                  alpn: f.alpn || undefined,
                  dest: f.dest || undefined,
                  xver: f.xver || undefined,
                })).filter((f) => f.tag),
              ],
              ...((inbound.fallbacks || []).length ? { allocate: { strategy: 'random' } } : {}),
            }
          : {}),
      };
    });

    // Routing profiles are curated presets stored in the database. Enabled profiles
    // for the node's organization are merged into the generated Xray config.
    const routingProfiles = await this.prisma.routingProfile.findMany({
      where: {
        enabled: true,
        OR: [{ organizationId: null }, ...(node.organizationId ? [{ organizationId: node.organizationId }] : [])],
      },
    });
    const nodeProfiles = routingProfiles.filter(
      (profile: any) => !profile.inboundId || inboundTags.has(profile.inboundId),
    );
    const profileRules: Record<string, unknown>[] = [];
    const profileDns: string[] = [];
    const profileOutbounds: Record<string, unknown>[] = [];
    for (const profile of nodeProfiles) {
      const payload = (profile.payload || {}) as {
        routingRules?: Record<string, unknown>[];
        dnsServers?: string[];
        outbounds?: Record<string, unknown>[];
      };
      if (Array.isArray(payload.routingRules)) {
        const tag = (profile as any).inboundId ? inboundTags.get((profile as any).inboundId) : null;
        profileRules.push(...(tag
          ? payload.routingRules.map((rule: Record<string, unknown>) => ({ ...rule, inboundTag: [tag] }))
          : payload.routingRules));
      }
      if (Array.isArray(payload.dnsServers)) profileDns.push(...payload.dnsServers);
      if (Array.isArray(payload.outbounds)) profileOutbounds.push(...payload.outbounds);
    }

    const [balancerConfig, dnsConfig] = await Promise.all([
      this.balancers.buildForConfig(),
      this.dnsProfiles.buildForConfig(),
    ]);

    const config: any = {
      log: { loglevel: 'warning' },
      dns: Array.isArray(dnsConfig.servers) && dnsConfig.servers.length
        ? { ...dnsConfig, servers: [...(dnsConfig.servers as unknown[]), ...profileDns.filter((entry) => !((dnsConfig.servers as unknown[]).includes(entry)))] }
        : { servers: [...new Set([...profileDns, '1.1.1.1', '8.8.8.8', 'localhost'])], queryStrategy: 'UseIP' },
      inbounds: [...inbounds, ...reverseInbounds],
      outbounds: [
        { tag: 'direct', protocol: 'freedom' },
        { tag: 'blocked', protocol: 'blackhole' },
        ...profileOutbounds,
        ...balancerConfig.outbounds,
        ...reverseOutbounds,
      ],
      routing: {
        domainStrategy: 'IPIfNonMatch',
        balancers: balancerConfig.balancers.length ? balancerConfig.balancers : undefined,
        rules: [
          ...reverseRules,
          ...balancerConfig.rules,
          ...rules
            .filter((r: any) => !r.inboundId || inboundTags.has(r.inboundId))
            .map((r: any) => {
              const tag = r.inboundId ? inboundTags.get(r.inboundId) : null;
              return tag ? { ...(r.payload || {}), inboundTag: [tag] } : r.payload;
            }),
          ...profileRules,
          ...chainRules,
          { type: 'field', network: 'tcp,udp', outboundTag: 'direct' },
        ],
      },
      policy: {
        levels: {
          '0': {
            handshake: 4,
            connIdle: 300,
            uplinkOnly: 2,
            downlinkOnly: 5,
            statsUserUplink: true,
            statsUserDownlink: true,
          },
        },
      },
    };

    // Mistgate-style IPv6 exit control: when disabled, resolve only A records
    // and send any IPv6 destination to the blackhole so clients fall back to IPv4.
    if (node.clientIpv6Enabled === false) {
      config.dns = { ...(config.dns || { servers: [] }), queryStrategy: 'UseIPv4' };
      const rules: any[] = config.routing.rules || [];
      const directIndex = rules.findIndex((rule: any) => rule?.outboundTag === 'direct' && rule?.network === 'tcp,udp');
      const blockRule = { type: 'field', ip: ['::/0'], outboundTag: 'blocked' };
      if (directIndex >= 0) rules.splice(directIndex, 0, blockRule);
      else rules.unshift(blockRule);
      config.routing.rules = rules;
    }

    if (balancerConfig.observerSelectors.length) {
      config.observatory = {
        subjectSelector: [...new Set(balancerConfig.observerSelectors)],
        probeUrl: balancerConfig.probeUrl || 'https://www.google.com/generate_204',
        probeInterval: `${balancerConfig.probeIntervalSec || 30}s`,
        enableConcurrency: true,
      };
    }

    // Optional loopback API for per-user traffic statistics read by the agent.
    if (process.env.XRAY_STATS_ENABLED === 'true') {
      const apiPort = Number(process.env.XRAY_API_PORT || 8080);
      config.api = { tag: 'api', services: ['HandlerService', 'StatsService'] };
      // Xray only records per-user counters when the top-level stats object exists.
      config.stats = {};
      config.inbounds.unshift({
        tag: 'api-in',
        listen: '127.0.0.1',
        port: apiPort,
        protocol: 'dokodemo-door',
        settings: { address: '127.0.0.1', port: apiPort, network: 'tcp' },
      });
      config.routing.rules.unshift({ type: 'field', inboundTag: ['api-in'], outboundTag: 'api' });
    }

    // User config profiles can add routing rules, DNS servers and outbounds.
    const profileIds = new Set(users.map((u) => u.configProfileId).filter(Boolean));
    if (profileIds.size) {
      const profiles = await this.prisma.configProfile.findMany({
        where: { id: { in: Array.from(profileIds) as string[] }, enabled: true },
      });
      for (const profile of profiles) {
        const payload = (profile.payload || {}) as any;
        if (Array.isArray(payload.routingRules)) config.routing.rules.unshift(...payload.routingRules);
        if (Array.isArray(payload.dnsServers)) config.dns.servers.unshift(...payload.dnsServers);
        if (Array.isArray(payload.outbounds)) config.outbounds.unshift(...payload.outbounds);
      }
    }

    const dualConfig = {
      xray: config,
      singbox: externalInbounds.length ? this.buildSingbox(externalInbounds, users) : null,
    };
    this.validateConfig(externalInbounds.length ? dualConfig : config);
    return { node, config: externalInbounds.length ? dualConfig : config };
  }

  validateConfig(config: any) {
    if (!config || typeof config !== 'object') throw new BadRequestException('Invalid config');
    if (config.xray || config.singbox) {
      if (config.xray) this.validateConfig(config.xray);
      if (config.singbox) {
        if (!Array.isArray(config.singbox.inbounds)) {
          throw new BadRequestException('singbox.inbounds must be an array');
        }
        if (!Array.isArray(config.singbox.outbounds)) {
          throw new BadRequestException('singbox.outbounds must be an array');
        }
      }
      return true;
    }
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
    const result: any = await this.agentClient.applyConfig(node, content, revision.version);
    if (result && result.applied === false) {
      throw new BadRequestException(result.error || 'Agent rejected the configuration');
    }
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
    try {
      await this.notifications.emit(
        NotificationEvent.CONFIG_APPLIED,
        {
          text: `🟢 Config revision <b>v${revision.version}</b> applied on <b>${node.name}</b>`,
          plainText: `Config revision v${revision.version} applied on ${node.name}`,
          subject: `XSS: config v${revision.version} applied`,
          webhook: {
            event: NotificationEvent.CONFIG_APPLIED,
            node: { id: node.id, name: node.name },
            revision: { id: revision.id, version: revision.version },
          },
        },
        node.organizationId,
      );
    } catch (e) {
      this.logger.error(`Failed to emit CONFIG_APPLIED for ${node.id}`, e as Error);
    }
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
