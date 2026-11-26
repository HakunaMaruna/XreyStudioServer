import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodeStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
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
    return nodes.map((n) => ({
      ...n,
      tokenHash: undefined,
      status: this.displayStatus(n),
      online: this.isOnline(n),
      agentOutdated: isAgentOutdated(n.agentVersion),
    }));
  }

  async pings(actor: AuthUser) {
    const nodes = await this.prisma.node.findMany({
      where: this.tenantWhere(actor),
      select: { id: true, address: true, agentUrl: true },
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
        organizationId: dto.organizationId || actor.organizationId || null,
      },
    });
    return { ...node, tokenHash: undefined, agentToken };
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
      data: { tokenHash: this.hashToken(agentToken) },
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
