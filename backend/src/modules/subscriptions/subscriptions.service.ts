import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  private encodeBase64(value: string) {
    return Buffer.from(value).toString('base64').replace(/=+$/, '');
  }

  private buildLink(user: any, inbound: any) {
    const settings = (inbound.settings || {}) as any;
    const node = inbound.node;
    const host = settings.publicHost || node?.address || '127.0.0.1';
    const port = inbound.port;
    const tag = encodeURIComponent(inbound.tag);
    const security = inbound.security || 'none';
    const transport = inbound.transport || 'tcp';
    const params = new URLSearchParams();
    params.set('type', transport === 'http' ? 'http' : transport);
    params.set('security', security);

    if (security === 'reality') {
      if (settings.realityPublicKey) params.set('pbk', settings.realityPublicKey);
      if (settings.realityShortIds?.[0] !== undefined) params.set('sid', settings.realityShortIds[0]);
      if (settings.realityServerNames?.[0]) params.set('sni', settings.realityServerNames[0]);
      params.set('fp', settings.realityFingerprint || 'chrome');
    }
    if (security === 'tls' && (settings.sni || settings.serverName)) {
      params.set('sni', settings.sni || settings.serverName);
    }
    if (transport === 'ws') {
      params.set('path', settings.wsPath || '/ws');
      if (settings.wsHeaders?.Host) params.set('host', settings.wsHeaders.Host);
    }
    if (transport === 'grpc') params.set('serviceName', settings.grpcServiceName || 'xss');
    if (transport === 'http') params.set('path', settings.httpPath || '/');

    switch (inbound.protocol) {
      case 'vless':
        params.set('encryption', 'none');
        if (settings.flow) params.set('flow', settings.flow);
        return `vless://${user.id}@${host}:${port}?${params.toString()}#${tag}`;
      case 'trojan':
        return `trojan://${user.subscriptionToken}@${host}:${port}?${params.toString()}#${tag}`;
      case 'shadowsocks': {
        const method = settings.method || 'aes-256-gcm';
        const userInfo = this.encodeBase64(`${method}:${user.subscriptionToken}`);
        return `ss://${userInfo}@${host}:${port}#${tag}`;
      }
      case 'hysteria2': {
        const external = new URLSearchParams();
        if (settings.sni || settings.serverName) external.set('sni', settings.sni || settings.serverName);
        if (settings.obfs) external.set('obfs', settings.obfs);
        return `hysteria2://${encodeURIComponent(user.subscriptionToken)}@${host}:${port}?${external.toString()}#${tag}`;
      }
      case 'tuic': {
        const external = new URLSearchParams();
        if (settings.sni || settings.serverName) external.set('sni', settings.sni || settings.serverName);
        external.set('congestion_control', settings.congestionControl || 'cubic');
        return `tuic://${user.id}:${encodeURIComponent(user.subscriptionToken)}@${host}:${port}?${external.toString()}#${tag}`;
      }
      case 'wireguard': {
        const external = new URLSearchParams();
        external.set('privatekey', settings.privateKey || '');
        if (settings.peers?.[0]?.public_key) external.set('peerkey', settings.peers[0].public_key);
        return `wireguard://${host}:${port}?${external.toString()}#${tag}`;
      }
      case 'vmess': {
        const vmess = {
          v: '2',
          ps: inbound.tag,
          add: host,
          port: String(port),
          id: user.id,
          aid: '0',
          scy: 'auto',
          net: transport,
          type: 'none',
          host: settings.wsHeaders?.Host || settings.publicHost || '',
          path: settings.wsPath || settings.httpPath || '/',
          tls: security === 'tls' ? 'tls' : '',
          sni: settings.sni || settings.serverName || '',
        };
        return `vmess://${Buffer.from(JSON.stringify(vmess)).toString('base64')}`;
      }
      default:
        return null;
    }
  }

  private async loadUser(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { subscriptionToken: token },
      include: {
        organization: true,
        inbounds: {
          where: { enabled: true },
          include: { node: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Subscription not found');
    return user;
  }

  async getStatus(token: string) {
    const user = await this.loadUser(token);
    const links = user.inbounds
      .map((inbound) => {
        const link = this.buildLink(user, inbound);
        return link
          ? {
              id: inbound.id,
              tag: inbound.tag,
              protocol: inbound.protocol,
              transport: inbound.transport,
              security: inbound.security,
              node: inbound.node?.name || null,
              link,
            }
          : null;
      })
      .filter(Boolean);

    return {
      token,
      user: { id: user.id, email: user.email },
      status:
        user.status !== 'ACTIVE'
          ? user.status === 'DISABLED'
            ? 'disabled'
            : 'expired'
          : user.expiresAt && user.expiresAt.getTime() <= Date.now()
            ? 'expired'
            : user.trafficLimit > 0n && user.trafficUsed >= user.trafficLimit
              ? 'exceeded'
              : 'active',
      expiresAt: user.expiresAt,
      trafficUsed: Number(user.trafficUsed),
      trafficLimit: Number(user.trafficLimit),
      trafficRemaining: Math.max(0, Number(user.trafficLimit) - Number(user.trafficUsed)),
      branding: user.organization?.branding || null,
      nodes: Array.from(
        new Map(
          user.inbounds
            .filter((i) => i.node)
            .map((i) => [i.node!.id, { id: i.node!.id, name: i.node!.name, address: i.node!.address }]),
        ).values(),
      ),
      links,
    };
  }

  async assertUsable(token: string) {
    const data = await this.getStatus(token);
    if (data.status !== 'active') throw new ForbiddenException(`Subscription is ${data.status}`);
    return data;
  }

  async raw(token: string) {
    const data = await this.assertUsable(token);
    return data.links.map((l: any) => l.link).join('\n');
  }

  async base64(token: string) {
    return Buffer.from(await this.raw(token)).toString('base64');
  }

  async json(token: string) {
    return this.getStatus(token);
  }

  async clash(token: string) {
    const data = await this.assertUsable(token);
    const proxies = data.links
      .filter((l: any) =>
        ['vless', 'trojan', 'ss', 'vmess', 'hysteria2', 'tuic', 'wireguard'].includes(l.protocol),
      )
      .map((l: any) => {
        const name = l.tag.replace(/[:"']/g, '');
        if (l.protocol === 'vless') {
          const url = new URL(l.link);
          return [
            `  - name: "${name}"`,
            `    type: vless`,
            `    server: ${url.hostname}`,
            `    port: ${url.port}`,
            `    uuid: ${url.username}`,
            `    network: ${url.searchParams.get('type') || 'tcp'}`,
            `    tls: ${url.searchParams.get('security') === 'tls'}`,
            `    servername: ${url.searchParams.get('sni') || ''}`,
            `    reality-opts:`,
            `      public-key: ${url.searchParams.get('pbk') || ''}`,
            `      short-id: ${url.searchParams.get('sid') || ''}`,
            `    client-fingerprint: ${url.searchParams.get('fp') || 'chrome'}`,
          ].join('\n');
        }
        if (l.protocol === 'trojan') {
          const url = new URL(l.link);
          return [
            `  - name: "${name}"`,
            `    type: trojan`,
            `    server: ${url.hostname}`,
            `    port: ${url.port}`,
            `    password: ${url.password || url.username}`,
            `    sni: ${url.searchParams.get('sni') || ''}`,
          ].join('\n');
        }
        if (l.protocol === 'hysteria2') {
          const url = new URL(l.link);
          return [
            `  - name: "${name}"`,
            '    type: hysteria2',
            `    server: ${url.hostname}`,
            `    port: ${url.port}`,
            `    password: ${decodeURIComponent(url.username)}`,
            `    sni: ${url.searchParams.get('sni') || ''}`,
            '    skip-cert-verify: true',
          ].join('\n');
        }
        if (l.protocol === 'tuic') {
          const url = new URL(l.link);
          return [
            `  - name: "${name}"`,
            '    type: tuic',
            `    server: ${url.hostname}`,
            `    port: ${url.port}`,
            `    uuid: ${url.username}`,
            `    token: ${decodeURIComponent(url.password)}`,
            `    sni: ${url.searchParams.get('sni') || ''}`,
            '    skip-cert-verify: true',
          ].join('\n');
        }
        if (l.protocol === 'wireguard') {
          const url = new URL(l.link);
          return [
            `  - name: "${name}"`,
            '    type: wireguard',
            `    server: ${url.hostname}`,
            `    port: ${url.port}`,
            `    private-key: ${url.searchParams.get('privatekey') || ''}`,
            `    public-key: ${url.searchParams.get('peerkey') || ''}`,
            '    allowed-ips: ["0.0.0.0/0", "::/0"]',
          ].join('\n');
        }
        return `  - name: "${name}"\n    type: ${l.protocol}`;
      });
    return [
      'mixed-port: 7890',
      'allow-lan: false',
      'mode: rule',
      'log-level: warning',
      'proxies:',
      ...(proxies.length ? proxies : ['  []']),
      'proxy-groups:',
      '  - name: PROXY',
      '    type: select',
      '    proxies:',
      ...data.links.map((l: any) => `      - "${l.tag.replace(/[:"']/g, '')}"`),
      'rules:',
      '  - MATCH,PROXY',
    ].join('\n');
  }

  async singbox(token: string) {
    const data = await this.assertUsable(token);
    const outbounds = data.links.map((l: any) => {
      const url = new URL(l.link);
      if (l.protocol === 'vless') {
        return {
          type: 'vless',
          tag: l.tag,
          server: url.hostname,
          server_port: Number(url.port),
          uuid: url.username,
          flow: url.searchParams.get('flow') || undefined,
          tls: {
            enabled: url.searchParams.get('security') !== 'none',
            server_name: url.searchParams.get('sni') || undefined,
            reality: {
              enabled: url.searchParams.get('security') === 'reality',
              public_key: url.searchParams.get('pbk') || undefined,
              short_id: url.searchParams.get('sid') || undefined,
            },
          },
          transport: {
            type: url.searchParams.get('type') || 'tcp',
            path: url.searchParams.get('path') || undefined,
          },
        };
      }
      if (l.protocol === 'trojan') {
        return {
          type: 'trojan',
          tag: l.tag,
          server: url.hostname,
          server_port: Number(url.port),
          password: url.password || url.username,
          tls: { enabled: true, server_name: url.searchParams.get('sni') || undefined },
        };
      }
      if (l.protocol === 'hysteria2') {
        const url = new URL(l.link);
        return {
          type: 'hysteria2',
          tag: l.tag,
          server: url.hostname,
          server_port: Number(url.port),
          password: decodeURIComponent(url.username),
          tls: { enabled: true, server_name: url.searchParams.get('sni') || undefined },
          ...(url.searchParams.get('obfs')
            ? { obfs: { type: 'salamander', password: url.searchParams.get('obfs') } }
            : {}),
        };
      }
      if (l.protocol === 'tuic') {
        const url = new URL(l.link);
        return {
          type: 'tuic',
          tag: l.tag,
          server: url.hostname,
          server_port: Number(url.port),
          uuid: url.username,
          token: decodeURIComponent(url.password),
          congestion_control: url.searchParams.get('congestion_control') || 'cubic',
          tls: { enabled: true, server_name: url.searchParams.get('sni') || undefined },
        };
      }
      if (l.protocol === 'wireguard') {
        const url = new URL(l.link);
        return {
          type: 'wireguard',
          tag: l.tag,
          server: url.hostname,
          server_port: Number(url.port),
          private_key: url.searchParams.get('privatekey') || '',
          peer_public_key: url.searchParams.get('peerkey') || '',
          local_address: ['10.0.0.2/32'],
        };
      }
      return { type: l.protocol, tag: l.tag };
    });
    return {
      log: { level: 'warn' },
      outbounds: [{ type: 'direct', tag: 'direct' }, ...outbounds],
      route: { final: outbounds[0]?.tag || 'direct' },
    };
  }
}
