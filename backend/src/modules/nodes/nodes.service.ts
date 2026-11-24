import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodeStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { AgentClientService } from '../config/agent-client.service';
import { CreateNodeDto, NodeMetricsDto, RegisterNodeDto, UpdateNodeDto } from './dto/node.dto';
import { NodeGeoDto } from './dto/geo.dto';

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
      online: n.lastSeenAt ? Date.now() - n.lastSeenAt.getTime() < 60_000 : false,
    }));
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
    return { ...node, tokenHash: undefined };
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
    if (dto.organizationId !== undefined) {
      if (actor.role !== Role.ADMIN && dto.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Cannot move a node to another organization');
      }
      data.organization = dto.organizationId
        ? { connect: { id: dto.organizationId } }
        : { disconnect: true };
    }
    const node = await this.prisma.node.update({ where: { id }, data });
    return { ...node, tokenHash: undefined };
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    await this.prisma.node.delete({ where: { id } });
    return { success: true };
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
    if (!node || node.tokenHash !== this.hashToken(token)) {
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
        ...(dto.address ? { address: dto.address } : {}),
      },
      select: { id: true, name: true, status: true, lastSeenAt: true },
    });
  }

  async metrics(nodeId: string, dto: NodeMetricsDto, token: string) {
    await this.verifyNodeToken(nodeId, token);
    const metric = await this.prisma.nodeMetric.create({
      data: {
        nodeId,
        cpu: dto.cpu || 0,
        ram: dto.ram || 0,
        disk: dto.disk || 0,
        trafficUp: BigInt(Math.round(dto.trafficUp || 0)),
        trafficDown: BigInt(Math.round(dto.trafficDown || 0)),
        connections: dto.connections || 0,
      },
    });
    await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: NodeStatus.ONLINE, lastSeenAt: new Date(), lastError: null },
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
    return {
      nodeId: id,
      status: node.status,
      online: node.lastSeenAt ? Date.now() - node.lastSeenAt.getTime() < 60_000 : false,
      lastSeenAt: node.lastSeenAt,
      lastError: node.lastError,
      latestMetric: last,
    };
  }

  async stats(actor: AuthUser) {
    const where = this.tenantWhere(actor);
    const [total, online, offline, error] = await Promise.all([
      this.prisma.node.count({ where }),
      this.prisma.node.count({ where: { ...where, status: NodeStatus.ONLINE } }),
      this.prisma.node.count({ where: { ...where, status: NodeStatus.OFFLINE } }),
      this.prisma.node.count({ where: { ...where, status: NodeStatus.ERROR } }),
    ]);
    return { total, online, offline, error };
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
