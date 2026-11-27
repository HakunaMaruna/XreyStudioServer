// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentClientService } from '../config/agent-client.service';
import { ConfigGeneratorService } from '../config/config-generator.service';
import { BindChainDto, ChainExitDto, CreateChainDto, UpdateChainDto } from './dto/chain.dto';

export type ChainServer = {
  host: string;
  port: number;
  uuid: string;
  publicKey: string;
  shortId: string;
  sni: string;
  flow: string;
  name: string;
};

@Injectable()
export class ChainsService {
  private readonly logger = new Logger(ChainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentClientService,
    private readonly config: ConfigGeneratorService,
  ) {}

  private tenantWhere(user: AuthUser) {
    if (user.role === Role.ADMIN) return {};
    return { OR: [{ organizationId: user.organizationId || null }, { organizationId: null }] };
  }

  private async findOwned(id: string, user: AuthUser) {
    const row = await this.prisma.proxyChain.findFirst({
      where: { id, ...this.tenantWhere(user) },
      include: {
        hops: { include: { node: { select: { id: true, name: true, address: true, status: true } } } },
        bindings: { include: { user: { select: { id: true, email: true } }, squad: { select: { id: true, name: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Chain not found');
    return row;
  }

  private format(row: any) {
    const entry = row.hops.find((hop: any) => hop.role === 'entry');
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      routingMode: row.routingMode,
      bridgeMode: row.bridgeMode || 'auto',
      routingRules: row.routingRules || [],
      entryNode: entry?.node ? { id: entry.node.id, name: entry.node.name } : null,
      entryPort: entry?.port ?? null,
      exits: row.hops.filter((hop: any) => hop.role === 'exit').map((hop: any) => ({
        id: hop.id,
        nodeId: hop.nodeId,
        nodeName: hop.node?.name || hop.nodeId,
        port: hop.port,
        priority: hop.priority,
        enabled: hop.enabled,
        status: hop.node?.status || 'UNKNOWN',
      })),
      bindings: row.bindings.map((binding: any) => ({
        id: binding.id,
        userId: binding.userId,
        userEmail: binding.user?.email || null,
        squadId: binding.squadId,
        squadName: binding.squad?.name || null,
      })),
      createdAt: row.createdAt,
    };
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.proxyChain.findMany({
      where: this.tenantWhere(user),
      orderBy: { createdAt: 'desc' },
      include: {
        hops: { include: { node: { select: { id: true, name: true, address: true, status: true } } } },
        bindings: { include: { user: { select: { id: true, email: true } }, squad: { select: { id: true, name: true } } } },
      },
    });
    return rows.map((row) => this.format(row));
  }

  async get(id: string, user: AuthUser) {
    return this.format(await this.findOwned(id, user));
  }

  private async node(id: string, user: AuthUser) {
    const node = await this.prisma.node.findFirst({ where: { id, ...this.tenantWhere(user) } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    return node;
  }

  private async domainForNode(nodeId: string) {
    const domain = await this.prisma.nodeDomain.findFirst({
      where: { nodeId, releasedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (domain) return domain.fqdn;
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    return node?.address || '127.0.0.1';
  }

  private keys() {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    const raw = (key: any, type: 'spki' | 'pkcs8') =>
      key.export({ format: 'der', type }).subarray(-32).toString('base64url');
    return {
      privateKey: raw(privateKey, 'pkcs8'),
      publicKey: raw(publicKey, 'spki'),
      shortId: randomBytes(8).toString('hex'),
    };
  }

  private async usedPorts(nodeId: string) {
    const [inbounds, hops] = await Promise.all([
      this.prisma.inbound.findMany({ where: { nodeId }, select: { port: true } }),
      this.prisma.proxyChainHop.findMany({ where: { nodeId }, select: { port: true } }),
    ]);
    return new Set([...inbounds, ...hops].map((item) => item.port));
  }

  private async pickPort(nodeId: string, preferred?: number) {
    const used = await this.usedPorts(nodeId);
    if (preferred && !used.has(preferred)) return preferred;
    for (let port = 10000; port <= 65000; port += 1) if (!used.has(port)) return port;
    throw new BadRequestException('No free port on the node');
  }

  private async assertNoCycle(entryNodeId: string, exits: ChainExitDto[], organizationId?: string | null) {
    const chains = await this.prisma.proxyChain.findMany({
      where: { status: 'active', ...(organizationId ? { organizationId } : {}) },
      include: { hops: { select: { nodeId: true, role: true } } },
    });
    const edges = new Map<string, string[]>();
    for (const chain of chains) {
      const entry = chain.hops.find((hop) => hop.role === 'entry');
      if (!entry) continue;
      edges.set(entry.nodeId, [
        ...(edges.get(entry.nodeId) || []),
        ...chain.hops.filter((hop) => hop.role === 'exit').map((hop) => hop.nodeId),
      ]);
    }
    for (const exit of exits) {
      if (exit.nodeId === entryNodeId) throw new BadRequestException('Entry and exit cannot be the same node');
      edges.set(entryNodeId, [...(edges.get(entryNodeId) || []), exit.nodeId]);
    }
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (edges.get(from) || []).some((next) => reaches(next, target, seen));
    };
    for (const exit of exits) {
      if (reaches(exit.nodeId, entryNodeId)) {
        throw new BadRequestException('Chain would create a loop between nodes');
      }
    }
  }

  private validateRoutingRules(rules?: Record<string, unknown>[]) {
    if (!rules) return;
    if (!Array.isArray(rules) || rules.length > 64) throw new BadRequestException('Invalid routingRules');
    const matchers = ['domain', 'ip', 'protocol', 'port', 'source', 'network'];
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') throw new BadRequestException('Invalid routing rule');
      if (!matchers.some((key) => rule[key] !== undefined)) {
        throw new BadRequestException('Each routing rule needs at least one matcher');
      }
      if (rule.outboundTag !== undefined && !['direct', 'blocked'].includes(String(rule.outboundTag))) {
        throw new BadRequestException('Unknown routing outboundTag');
      }
    }
  }

  async create(dto: CreateChainDto, user: AuthUser) {
    if (!dto.exits?.length) throw new BadRequestException('At least one exit node is required');
    this.validateRoutingRules(dto.routingRules);
    if (dto.routingMode === 'rules' && !dto.routingRules?.length) {
      throw new BadRequestException('routingRules are required when routingMode is rules');
    }
    if (user.role !== Role.ADMIN && !user.organizationId) throw new ForbiddenException('Organization is required');
    const orgId = user.role === Role.ADMIN ? dto.organizationId || null : user.organizationId;
    const entry = await this.node(dto.entryNodeId, user);
    if (entry.status !== 'ONLINE') throw new BadRequestException(`Entry node ${entry.name} is offline`);
    const exitNodes = [];
    for (const exit of dto.exits) {
      const node = await this.node(exit.nodeId, user);
      if (node.status !== 'ONLINE') throw new BadRequestException(`Exit node ${node.name} is offline`);
      exitNodes.push({ dto: exit, node });
    }
    await this.assertNoCycle(dto.entryNodeId, dto.exits, orgId);

    const entryPort = await this.pickPort(entry.id);
    const chain = await this.prisma.proxyChain.create({
      data: {
        name: dto.name,
        status: 'active',
        routingMode: dto.routingMode || 'all',
        bridgeMode: dto.bridgeMode || 'auto',
        routingRules: dto.routingRules ? dto.routingRules as any : null,
        organizationId: orgId,
        hops: {
          create: [
            {
              nodeId: entry.id, role: 'entry', port: entryPort, uuid: randomUUID(),
              sni: await this.domainForNode(entry.id),
            },
            ...await Promise.all(exitNodes.map(async ({ dto: exit, node }) => {
              const keys = this.keys();
              const port = await this.pickPort(node.id, exit.port);
              return {
                nodeId: node.id,
                role: 'exit',
                priority: exit.priority ?? 0,
                port,
                uuid: randomUUID(),
                sni: await this.domainForNode(node.id),
                privateKey: keys.privateKey,
                publicKey: keys.publicKey,
                shortId: keys.shortId,
                enabled: exit.enabled ?? true,
              };
            })),
          ],
        },
      },
      include: { hops: true },
    });

    for (const hop of chain.hops.filter((item) => item.role === 'exit')) {
      await this.prisma.inbound.create({
        data: {
          tag: `chain-${chain.id.slice(0, 8)}-${hop.id.slice(0, 8)}`,
          nodeId: hop.nodeId,
          protocol: 'vless',
          transport: 'tcp',
          security: 'reality',
          port: hop.port,
          listen: '0.0.0.0',
          flow: 'xtls-rprx-vision',
          sni: hop.sni,
          settings: {
            chainId: chain.id,
            hopId: hop.id,
            publicHost: hop.sni,
            sni: hop.sni,
            flow: 'xtls-rprx-vision',
            realityPrivateKey: hop.privateKey,
            realityPublicKey: hop.publicKey,
            realityShortIds: [hop.shortId],
            realityServerNames: [hop.sni],
            realityFingerprint: 'chrome',
            realityDest: '127.0.0.1:8443',
            spiderX: '/',
          },
          enabled: true,
        },
      });
    }
    return this.format({ ...chain, bindings: [] });
  }

  async update(id: string, dto: UpdateChainDto, user: AuthUser) {
    const current = await this.findOwned(id, user);
    if (user.role !== Role.ADMIN && dto.organizationId !== undefined && dto.organizationId !== user.organizationId) {
      throw new ForbiddenException('Cannot move a chain to another organization');
    }
    this.validateRoutingRules(dto.routingRules);
    if (dto.exits !== undefined) {
      if (!dto.exits.length) throw new BadRequestException('At least one exit node is required');
      for (const exit of dto.exits) {
        const node = await this.node(exit.nodeId, user);
        if (node.status !== 'ONLINE') throw new BadRequestException(`Exit node ${node.name} is offline`);
      }
      await this.assertNoCycle(current.hops.find((h) => h.role === 'entry')?.nodeId || '', dto.exits, current.organizationId);
      // Rebuild exit hops and their inbounds.
      const oldExits = current.hops.filter((hop) => hop.role === 'exit');
      const nextNodeIds = new Set(dto.exits.map((exit) => exit.nodeId));
      await this.prisma.proxyChainHop.deleteMany({ where: { chainId: id, role: 'exit' } });
      await this.prisma.inbound.deleteMany({
        where: { settings: { path: ['chainId'], equals: id } },
      });
      for (const exit of dto.exits) {
        const node = await this.node(exit.nodeId, user);
        const keys = this.keys();
        const hop = await this.prisma.proxyChainHop.create({
          data: {
            chainId: id, nodeId: node.id, role: 'exit',
            priority: exit.priority ?? 0,
            port: await this.pickPort(node.id, exit.port),
            uuid: randomUUID(), sni: await this.domainForNode(node.id),
            privateKey: keys.privateKey, publicKey: keys.publicKey, shortId: keys.shortId,
            enabled: exit.enabled ?? true,
          },
        });
        await this.prisma.inbound.create({
          data: {
            tag: `chain-${id.slice(0, 8)}-${hop.id.slice(0, 8)}`,
            nodeId: node.id, protocol: 'vless', transport: 'tcp', security: 'reality',
            port: hop.port, listen: '0.0.0.0', flow: 'xtls-rprx-vision', sni: hop.sni,
            settings: {
              chainId: id, hopId: hop.id, publicHost: hop.sni, sni: hop.sni,
              flow: 'xtls-rprx-vision', realityPrivateKey: hop.privateKey,
              realityPublicKey: hop.publicKey, realityShortIds: [hop.shortId],
              realityServerNames: [hop.sni], realityFingerprint: 'chrome',
              realityDest: '127.0.0.1:8443', spiderX: '/',
            },
          },
        });
      }
      for (const oldExit of oldExits) {
        if (nextNodeIds.has(oldExit.nodeId)) continue;
        const node = await this.prisma.node.findUnique({ where: { id: oldExit.nodeId } });
        if (node) await this.clearRelaysForChain(node as any, id);
      }
    }
    await this.prisma.proxyChain.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.routingMode !== undefined ? { routingMode: dto.routingMode } : {}),
        ...(dto.bridgeMode !== undefined ? { bridgeMode: dto.bridgeMode } : {}),
        ...(dto.routingRules !== undefined ? { routingRules: dto.routingRules as any } : {}),
        ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
      },
    });
    await this.syncClients(id);
    return this.get(id, user);
  }

  private async clearRelaysForChain(node: any, chainId: string) {
    const current = await this.agent.relayStatus(node);
    const relays = ((current as any)?.relays || []).filter(
      (relay: any) => relay.id !== chainId && !String(relay.id).startsWith(`${chainId}:`),
    );
    await this.agent.applyRelays(node, relays).catch((error: any) => {
      this.logger.warn(`Failed to clear relays: ${error.message}`);
    });
  }

  async remove(id: string, user: AuthUser) {
    const chain = await this.findOwned(id, user);
    const entry = chain.hops.find((hop) => hop.role === 'entry');
    if (entry) {
      await this.clearRelaysForChain(entry.node as any, id);
    }
    for (const hop of chain.hops.filter((item) => item.role === 'exit')) {
      if (!hop.node) continue;
      await this.clearRelaysForChain(hop.node as any, id);
    }
    await this.prisma.inbound.deleteMany({ where: { settings: { path: ['chainId'], equals: id } } });
    await this.prisma.proxyChain.delete({ where: { id } });
    return { success: true };
  }

  private async syncClients(chainId: string) {
    const chain = await this.prisma.proxyChain.findUnique({
      where: { id: chainId },
      include: { bindings: true, hops: true },
    });
    if (!chain) return;
    const squadIds = chain.bindings.map((b) => b.squadId).filter(Boolean) as string[];
    const squadUsers = squadIds.length
      ? await this.prisma.user.findMany({ where: { squadId: { in: squadIds } }, select: { id: true } })
      : [];
    const userIds = Array.from(new Set([
      ...chain.bindings.map((b) => b.userId).filter(Boolean),
      ...squadUsers.map((u) => u.id),
    ])) as string[];
    const inbounds = await this.prisma.inbound.findMany({
      where: { settings: { path: ['chainId'], equals: chainId } },
      select: { id: true },
    });
    for (const inbound of inbounds) {
      await this.prisma.inboundClient.deleteMany({ where: { inboundId: inbound.id } });
      if (userIds.length) {
        await this.prisma.inboundClient.createMany({
          data: userIds.map((userId) => ({ inboundId: inbound.id, userId })),
          skipDuplicates: true,
        });
      }
    }
  }

  async bind(id: string, dto: BindChainDto, user: AuthUser) {
    await this.findOwned(id, user);
    if (!dto.userId && !dto.squadId) throw new BadRequestException('userId or squadId is required');
    const binding = await this.prisma.chainBinding.upsert({
      where: {
        id: (await this.prisma.chainBinding.findFirst({
          where: { chainId: id, userId: dto.userId || null, squadId: dto.squadId || null },
        }))?.id || randomUUID(),
      },
      create: { chainId: id, userId: dto.userId || null, squadId: dto.squadId || null },
      update: {},
    });
    await this.syncClients(id);
    return binding;
  }

  async unbind(id: string, bindingId: string, user: AuthUser) {
    await this.findOwned(id, user);
    const binding = await this.prisma.chainBinding.findFirst({ where: { id: bindingId, chainId: id } });
    if (!binding) throw new NotFoundException('Binding not found');
    await this.prisma.chainBinding.delete({ where: { id: bindingId } });
    await this.syncClients(id);
    return { success: true };
  }

  async unbindUser(userId: string, actor: AuthUser) {
    const scope = actor.role === Role.ADMIN ? {} : { chain: { organizationId: actor.organizationId || null } };
    const rows = await this.prisma.chainBinding.findMany({ where: { userId, ...scope } });
    const chainIds = Array.from(new Set(rows.map((row) => row.chainId)));
    await this.prisma.chainBinding.deleteMany({ where: { userId } });
    for (const chainId of chainIds) await this.syncClients(chainId);
    return { success: true, chains: chainIds.length };
  }

  async bindingForUser(userId: string, organizationId?: string | null, squadId?: string | null) {
    const orgScope = organizationId
      ? { chain: { OR: [{ organizationId }, { organizationId: null }] } }
      : {};
    const userBinding = await this.prisma.chainBinding.findFirst({
      where: { userId, ...orgScope },
      include: { chain: { include: { hops: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const binding = userBinding || (squadId
      ? await this.prisma.chainBinding.findFirst({
        where: { squadId, ...orgScope },
        include: { chain: { include: { hops: true } } },
        orderBy: { createdAt: 'desc' },
      })
      : null);
    if (!binding || binding.chain.status !== 'active') return null;
    const entry = binding.chain.hops.find((hop) => hop.role === 'entry');
    if (!entry) return null;
    const node = await this.prisma.node.findUnique({ where: { id: entry.nodeId } });
    const host = entry.sni || node?.address || '';
    return {
      chainId: binding.chain.id, chainName: binding.chain.name,
      host, port: entry.port, entry: { host, port: entry.port },
    };
  }

  async subscriptionServers(userId: string, organizationId?: string | null, squadId?: string | null, name = 'Chain'): Promise<ChainServer[]> {
    const binding = await this.bindingForUser(userId, organizationId, squadId);
    if (!binding) return [];
    const chain = await this.prisma.proxyChain.findUnique({
      where: { id: binding.chainId },
      include: { hops: { include: { node: true } } },
    });
    if (!chain) return [];
    const primary = chain.hops.filter((hop) => hop.role === 'exit' && hop.enabled)
      .sort((a, b) => a.priority - b.priority)[0];
    return primary ? [{
        host: binding.host,
        port: binding.port,
        uuid: userId,
        publicKey: primary.publicKey || '',
        shortId: primary.shortId || '',
        sni: primary.sni || '',
        flow: 'xtls-rprx-vision',
      name: `${name} · ${primary.node?.name || 'exit'}`,
    }] : [];
  }

  async apply(id: string, user: AuthUser) {
    const chain = await this.findOwned(id, user);
    const entry = chain.hops.find((hop) => hop.role === 'entry');
    if (!entry) throw new BadRequestException('Chain has no entry node');
    const targets = chain.hops.filter((hop) => hop.role === 'exit' && hop.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((hop) => ({ host: hop.node.address, port: hop.port, priority: hop.priority }));
    const entryNode = await this.prisma.node.findUnique({ where: { id: entry.nodeId } });
    if (!entryNode) throw new NotFoundException('Entry node not found');
    const bridge = chain.bridgeMode === 'bridge';
    const bridgePort = bridge ? await this.pickPort(entryNode.id, entry.port + 1) : null;
    const relays = [{
      id: chain.id,
      listenPort: entry.port,
      targets,
      targetHost: targets[0]?.host || '',
      targetPort: targets[0]?.port || 1,
      mode: (bridge ? 'bridge-entry' : 'direct') as 'bridge-entry' | 'direct',
      ...(bridgePort ? { bridgePort } : {}),
      enabled: chain.status === 'active' && targets.length > 0,
    }];

    const exitRelays = bridge
      ? chain.hops.filter((hop) => hop.role === 'exit').map((hop) => ({
          id: `${chain.id}:bridge:${hop.id}`,
          mode: 'bridge-exit' as const,
          bridgeHost: entryNode.address,
          bridgePort: bridgePort as number,
          targetHost: '127.0.0.1',
          targetPort: hop.port,
          replicas: 2,
          enabled: hop.enabled && chain.status === 'active',
        }))
      : [];
    const before = await this.agent.relayStatus(entryNode as any);
    const beforeByNode = new Map<string, any[]>();
    beforeByNode.set(entryNode.id, (before as any)?.relays || []);
    const applied: string[] = [];
    try {
      await this.agent.applyRelays(entryNode as any, relays);
      applied.push(entryNode.id);
      for (const exit of chain.hops.filter((hop) => hop.role === 'exit')) {
        const node = await this.prisma.node.findUnique({ where: { id: exit.nodeId } });
        if (!node) continue;
        if (bridge) {
          const prev = await this.agent.relayStatus(node as any);
          beforeByNode.set(node.id, (prev as any)?.relays || []);
          const own = exitRelays.filter((relay) => relay.id.endsWith(`:${exit.id}`));
          await this.agent.applyRelays(node as any, own);
        }
                const appliedConfig = await this.config.applyRevision(node.id);
        if (!appliedConfig?.applied) throw new Error(`Config apply failed on ${node.name}`);
        applied.push(node.id);
      }
      return { applied: true, relays: relays.length, bridge: bridge || undefined, nodes: applied.length };
    } catch (error: any) {
      for (const [nodeId, previous] of beforeByNode) {
        const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
        if (node) {
          await this.agent.applyRelays(node as any, previous)
            .catch((e) => this.logger.warn(`Rollback failed for ${nodeId}: ${e.message}`));
        }
      }
      throw new BadRequestException(`Chain apply failed and was rolled back: ${error.message}`);
    }
  }

  async status(id: string, user: AuthUser) {
    const chain = await this.findOwned(id, user);
    const hops = await Promise.all(chain.hops.map(async (hop) => {
      const node = hop.node as any;
      const ping = await this.agent.ping(node).catch(() => ({ reachable: false }));
      return { id: hop.id, role: hop.role, node: node?.name, reachable: ping.reachable, status: node?.status };
    }));
    return { id: chain.id, status: chain.status, hops };
  }
}
