import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodeStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as net from 'net';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret } from '../../common/secret-crypto';
import { APP_VERSION, isAgentOutdated } from '../../version';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { AgentClientService } from '../config/agent-client.service';
import { CreateNodeDto, NodeMetricsDto, RegisterNodeDto, UpdateNodeDto } from './dto/node.dto';
import { NodeGeoDto } from './dto/geo.dto';

const OFFLINE_AFTER_MS = Number(process.env.NODE_OFFLINE_AFTER_MS || 120_000);

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private configGenerator: ConfigGeneratorService,
    private agentClient: AgentClientService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private tenantWhere(actor: AuthUser): Prisma.NodeWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || '__none__' };
  }

  private displayStatus(node: { status: NodeStatus; lastSeenAt: Date | null }): NodeStatus {
    const stale = !node.lastSeenAt || Date.now() - node.lastSeenAt.getTime() > OFFLINE_AFTER_MS;
    return node.status === NodeStatus.ONLINE && stale ? NodeStatus.OFFLINE : node.status;
  }

  private isOnline(node: { lastSeenAt: Date | null }) {
    return Boolean(node.lastSeenAt && Date.now() - node.lastSeenAt.getTime() <= OFFLINE_AFTER_MS);
  }

  async findAll(actor: AuthUser) {
    const nodes = await this.prisma.node.findMany({
      where: this.tenantWhere(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        metrics: { orderBy: { createdAt: 'desc' }, take: 1 },
        geo: true,
        _count: { select: { inbounds: true, revisions: true } },
      },
    });
    const domains = await this.prisma.nodeDomain.findMany({
      where: { nodeId: { in: nodes.map((node) => node.id) }, releasedAt: null },
      select: { nodeId: true, fqdn: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const domainByNode = new Map<string, string>();
    for (const domain of domains) {
      if (domain.nodeId && !domainByNode.has(domain.nodeId)) domainByNode.set(domain.nodeId, domain.fqdn);
    }
    return nodes.map((n) => ({
      ...n,
      tokenHash: undefined,
      agentSecret: undefined,
      status: this.displayStatus(n),
      online: this.isOnline(n),
      agentOutdated: isAgentOutdated(n.agentVersion),
      domain: domainByNode.get(n.id) || null,
    }));
  }

  async pings(actor: AuthUser) {
    const nodes = await this.prisma.node.findMany({
      where: this.tenantWhere(actor),
      select: { id: true, address: true, agentUrl: true, agentSecret: true, jumpNodeId: true },
    });
    const entries = await Promise.all(nodes.map(async (node) => {
      const result = await this.agentClient.ping(node as any);
      return [node.id, result.reachable ? result.latencyMs : null] as const;
    }));
    return Object.fromEntries(entries);
  }

  async findOne(id: string, actor: AuthUser) {
    const node = await this.prisma.node.findFirst({
      where: { id, ...this.tenantWhere(actor) },
      include: {
        metrics: { orderBy: { createdAt: 'desc' }, take: 30 },
        inbounds: true,
        revisions: { orderBy: { version: 'desc' }, take: 10 },
      },
    });
    if (!node) throw new NotFoundException('Node not found');
    return {
      ...node,
      tokenHash: undefined,
      agentSecret: undefined,
      status: this.displayStatus(node),
      online: this.isOnline(node),
    };
  }

  async create(dto: CreateNodeDto, actor: AuthUser) {
    if (actor.role !== Role.ADMIN && dto.organizationId && dto.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a node to another organization');
    }
    const agentToken = randomBytes(32).toString('hex');
    const node = await this.prisma.node.create({
      data: {
        name: dto.name,
        address: dto.address,
        port: dto.port || 443,
        agentUrl: dto.agentUrl || null,
        tokenHash: this.hashToken(agentToken),
        agentSecret: encryptSecret(agentToken),
        organizationId: dto.organizationId || actor.organizationId || null,
      },
    });
    return { ...node, tokenHash: undefined, agentSecret: undefined, agentToken };
  }

  async update(id: string, dto: UpdateNodeDto, actor: AuthUser) {
    await this.findOne(id, actor);
    const data: Prisma.NodeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.port !== undefined) data.port = dto.port;
    if (dto.agentUrl !== undefined) data.agentUrl = dto.agentUrl;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.organizationId !== undefined) {
      if (actor.role !== Role.ADMIN && dto.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot move a node to another organization');
      }
      data.organization = dto.organizationId
        ? { connect: { id: dto.organizationId } }
        : { disconnect: true };
    }
    const node = await this.prisma.node.update({ where: { id }, data });
    return {
      ...node,
      tokenHash: undefined,
      agentSecret: undefined,
      status: this.displayStatus(node),
      online: this.isOnline(node),
    };
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    // Prisma cascades inbounds, metrics, geo, revisions, health checks, tunnels, etc.
    // The remaining tables have no FK relation, so clean them explicitly in one transaction.
    const [jobs, credentials, domains, traffic] = await this.prisma.$transaction([
      this.prisma.nodeInstallJob.deleteMany({ where: { nodeId: id } }),
      this.prisma.wizardCredential.deleteMany({ where: { nodeId: id } }),
      this.prisma.nodeDomain.deleteMany({ where: { nodeId: id } }),
      this.prisma.userTraffic.updateMany({ where: { nodeId: id }, data: { nodeId: null } }),
      this.prisma.node.delete({ where: { id } }),
    ]);
    return {
      success: true,
      deleted: {
        installJobs: jobs.count,
        wizardCredentials: credentials.count,
        nodeDomains: domains.count,
        trafficRowsUnlinked: traffic.count,
      },
    };
  }

  /** Removes inbounds whose node was deleted before cascade was enabled (nodeId = null). */
  async removeOrphanInbounds() {
    const result = await this.prisma.inbound.deleteMany({ where: { nodeId: null } });
    return { success: true, deleted: result.count };
  }

  async rotateToken(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    const agentToken = randomBytes(32).toString('hex');
    await this.prisma.node.update({
      where: { id },
      data: { tokenHash: this.hashToken(agentToken), agentSecret: encryptSecret(agentToken) },
    });
    return { agentToken };
  }

  async verifyNodeToken(nodeId: string, token: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    const expected = Buffer.from(node?.tokenHash || '');
    const actual = Buffer.from(this.hashToken(token));
    if (!node || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ForbiddenException('Invalid node token');
    }
    return node;
  }

  async register(dto: RegisterNodeDto, token: string) {
    const node = await this.verifyNodeToken(dto.nodeId, token);
    return this.prisma.node.update({
      where: { id: node.id },
      data: {
        status: NodeStatus.ONLINE,
        lastSeenAt: new Date(),
        lastError: null,
        xrayVersion: dto.xrayVersion || node.xrayVersion,
        ...(node.agentSecret ? {} : { agentSecret: encryptSecret(token) }),
        ...this.agentVersionData(dto.agentVersion, node.agentVersion),
        ...(dto.address ? { address: dto.address } : {}),
      },
      select: { id: true, name: true, status: true, lastSeenAt: true, agentVersion: true },
    });
  }

  // Отчёт агента — единственный источник его версии; обновляем отметку времени
  // только когда версия действительно изменилась.
  private agentVersionData(reported: string | undefined, stored: string | null) {
    const version = String(reported || '').trim();
    if (!version || version === stored) return {};
    return { agentVersion: version.slice(0, 64), agentUpdatedAt: new Date() };
  }

  async metrics(nodeId: string, dto: NodeMetricsDto, token: string) {
    const node = await this.verifyNodeToken(nodeId, token);
    const metric = await this.prisma.nodeMetric.create({
      data: {
        nodeId,
        cpu: dto.cpu || 0,
        ram: dto.ram || 0,
        disk: dto.disk || 0,
        trafficUp: BigInt(Math.round(dto.trafficUp || 0)),
        trafficDown: BigInt(Math.round(dto.trafficDown || 0)),
        connections: dto.connections || 0,
        xrayStatus: dto.xray || null,
      },
    });
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        status: NodeStatus.ONLINE,
        lastSeenAt: new Date(),
        lastError: null,
        ...this.agentVersionData(dto.agentVersion, node.agentVersion),
      },
    });
    return metric;
  }

  async reportGeo(nodeId: string, dto: NodeGeoDto, token: string) {
    await this.verifyNodeToken(nodeId, token);
    return this.prisma.nodeGeo.upsert({
      where: { nodeId },
      create: {
        nodeId,
        ip: dto.ip,
        countryCode: dto.countryCode?.toUpperCase(),
        city: dto.city,
        asn: dto.asn,
        org: dto.org,
      },
      update: {
        ip: dto.ip,
        countryCode: dto.countryCode?.toUpperCase(),
        city: dto.city,
        asn: dto.asn,
        org: dto.org,
        checkedAt: new Date(),
      },
    });
  }

  async ipv6Addresses(id: string, actor: AuthUser) {
    const node = await this.findOne(id, actor);
    const health: any = await this.agentClient.health(node as any);
    const addresses: string[] = Array.isArray(health?.ipv6Addresses)
      ? health.ipv6Addresses.filter((value: unknown) => typeof value === 'string' && /^[0-9a-fA-F:]+$/.test(value))
      : [];
    await this.prisma.node.update({ where: { id }, data: { ipv6Addresses: addresses } });
    return { nodeId: id, addresses };
  }

  async checkIpv6(id: string, actor: AuthUser, address?: string) {
    const node = await this.findOne(id, actor);
    const addresses: string[] = Array.isArray((node as any).ipv6Addresses)
      ? (node as any).ipv6Addresses as string[]
      : [];
    const target = address || (node as any).ipv6Address || addresses[0];
    if (!target || !addresses.includes(target)) throw new BadRequestException('IPv6 address is not reported by the node');
    const ports = (node as any).inbounds
      ? (node as any).inbounds.filter((i: any) => i.enabled && ['tcp', 'ws', 'grpc', 'http'].includes(i.transport || 'tcp')).map((i: any) => i.port)
      : [];
    const results = await Promise.all(ports.slice(0, 8).map((port: number) =>
      new Promise<{ port: number; reachable: boolean }>((resolve) => {
        const socket = net.connect({ host: target, port, family: 6 });
        const done = (reachable: boolean) => { socket.destroy(); resolve({ port, reachable }); };
        socket.setTimeout(3000);
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.once('timeout', () => done(false));
      }),
    ));
    const reachable = results.some((result) => result.reachable);
    await this.prisma.node.update({
      where: { id },
      data: { ipv6VerifiedAt: reachable ? new Date() : null, ipv6LastError: reachable ? null : 'No IPv6 inbound port answered from the panel' },
    });
    return { nodeId: id, address: target, reachable, results };
  }

  async setIpv6(id: string, actor: AuthUser, dto: { enabled?: boolean; address?: string | null }) {
    const node = await this.findOne(id, actor);
    const addresses: string[] = Array.isArray((node as any).ipv6Addresses) ? (node as any).ipv6Addresses as string[] : [];
    if (dto.enabled) {
      const address = dto.address || (node as any).ipv6Address || addresses[0];
      if (!address || net.isIP(address) !== 6) throw new BadRequestException('A valid IPv6 address is required');
      if (addresses.length && !addresses.includes(address)) {
        throw new BadRequestException('IPv6 address is not reported by the node');
      }
    }
    return this.prisma.node.update({
      where: { id },
      data: {
        ipv6Enabled: Boolean(dto.enabled),
        ...(dto.enabled ? { ipv6Address: dto.address || (node as any).ipv6Address || addresses[0] || null } : { ipv6Address: null }),
      },
      select: { id: true, ipv6Enabled: true, ipv6Address: true, ipv6Addresses: true, ipv6VerifiedAt: true, ipv6LastError: true },
    });
  }

  async health(id: string, actor?: AuthUser) {
    const node = actor ? await this.findOne(id, actor) : await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Node not found');
    const last = (node as any).metrics?.[0] || null;
    // Агент отправляет метрики каждые 15 с, trafficUp/down — байты за интервал.
    const intervalSeconds = Number(process.env.NODE_METRIC_INTERVAL_SECONDS || 15);
    const uploadBps = last ? Math.round(Number(last.trafficUp) / intervalSeconds) : 0;
    const downloadBps = last ? Math.round(Number(last.trafficDown) / intervalSeconds) : 0;
    const ping = await this.agentClient.ping(node as any);
    return {
      nodeId: id,
      status: this.displayStatus(node),
      online: this.isOnline(node),
      lastSeenAt: node.lastSeenAt,
      lastError: node.lastError,
      agent: {
        version: node.agentVersion || null,
        expectedVersion: APP_VERSION,
        outdated: isAgentOutdated(node.agentVersion),
      },
      xray: last?.xrayStatus || 'unknown',
      network: {
        uploadBps,
        downloadBps,
        uploadMbps: Number((uploadBps * 8 / 1_000_000).toFixed(3)),
        downloadMbps: Number((downloadBps * 8 / 1_000_000).toFixed(3)),
      },
      ping,
      latestMetric: last,
    };
  }

  async stats(actor: AuthUser) {
    const where = this.tenantWhere(actor);
    const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
    const [total, online, error] = await Promise.all([
      this.prisma.node.count({ where }),
      this.prisma.node.count({ where: { ...where, status: NodeStatus.ONLINE, lastSeenAt: { gte: cutoff } } }),
      this.prisma.node.count({ where: { ...where, status: NodeStatus.ERROR } }),
    ]);
    return { total, online, offline: Math.max(0, total - online - error), error };
  }

  async applyConfig(id: string, actor: AuthUser, revisionId?: string) {
    await this.findOne(id, actor);
    return this.configGenerator.applyRevision(id, revisionId);
  }

  async revisions(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    return this.configGenerator.listRevisions(id);
  }

  async rollback(id: string, revisionId: string, actor: AuthUser) {
    await this.findOne(id, actor);
    return this.configGenerator.rollback(id, revisionId);
  }

  async restart(id: string, actor: AuthUser) {
    const node = await this.findOne(id, actor);
    return this.agentClient.restart(node);
  }

  async agentConfig(id: string, token: string) {
    await this.verifyNodeToken(id, token);
    const revision = await this.prisma.configRevision.findFirst({
      where: { nodeId: id },
      orderBy: { version: 'desc' },
    });
    return revision ? { version: revision.version, config: JSON.parse(revision.content) } : { version: 0, config: null };
  }
}
