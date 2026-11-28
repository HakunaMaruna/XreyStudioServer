// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PluginRecipeService } from '../plugins/plugin-recipe.service';
import { nodeUsedPorts, pickFreePort } from '../../common/node-ports';

export type InboundRecipe = {
  id: string;
  name: string;
  description?: string;
  nameRu?: string;
  descriptionRu?: string;
  /** main — everyday client access, spare — second port, test — diagnostics only. */
  purpose?: 'main' | 'spare' | 'test';
  /** Filled by list(nodeId) when the recipe port is already used on that node. */
  portBusyBy?: string | null;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  protocol?: string;
  transport?: string;
  security?: string;
  port?: number;
  flow?: string;
  path?: string;
  sni?: string;
  settings?: Record<string, unknown>;
  generateKeys?: boolean;
};

const BUILTIN: InboundRecipe[] = [
  {
    id: 'vless-reality-selfsni', name: 'VLESS Reality (selfSNI)', source: 'builtin',
    description: 'Port 443, xtls-rprx-vision, masks as the node domain, local decoy site.',
    nameRu: 'Основной (Reality, 443)', purpose: 'main',
    descriptionRu: 'Рекомендуется для клиентов. Порт 443, Vision, маскировка под домен ноды и локальный сайт-заглушка.',
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 443,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-reality-alt', name: 'VLESS Reality (alt port)', source: 'builtin',
    description: 'Same as the default but on port 2054 for testing multiple connections.',
    nameRu: 'Запасной порт (Reality, 2054)', purpose: 'spare',
    descriptionRu: 'Как основной, но на порту 2054. Пригодится, если 443 занят или блокируется у провайдера.',
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 2054,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-reality-4436', name: 'VLESS Reality (4436)', source: 'builtin',
    description: 'Reality on port 4436; publish this port on the node.',
    nameRu: 'Запасной порт (Reality, 4436)', purpose: 'spare',
    descriptionRu: 'Reality на порту 4436 — ещё один запасной вариант.',
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 4436,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-plain', name: 'VLESS (no TLS)', source: 'builtin',
    description: 'Plain VLESS on port 2053 for a quick transport check.',
    nameRu: 'Проверка: VLESS без шифрования (2053)', purpose: 'test',
    descriptionRu: 'Только для диагностики: трафик не маскируется. Не выдавайте клиентам.',
    protocol: 'vless', transport: 'tcp', security: 'none', port: 2053,
  },
  {
    id: 'vmess-ws', name: 'VMess WebSocket', source: 'builtin',
    description: 'VMess over WebSocket with /ws path on port 2053.',
    nameRu: 'Проверка: VMess WebSocket (2053)', purpose: 'test',
    descriptionRu: 'Для проверки транспорта WebSocket и работы через CDN. Не основной вариант для клиентов.',
    protocol: 'vmess', transport: 'ws', security: 'none', port: 2053, path: '/ws',
  },
];

@Injectable()
export class InboundRecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginRecipes: PluginRecipeService,
  ) {}

  async list(nodeId?: string): Promise<InboundRecipe[]> {
    const plugin = await this.pluginRecipes.listForInbounds().catch(() => []);
    const all = [...BUILTIN, ...plugin];
    if (!nodeId) return all;
    const owners = await nodeUsedPorts(this.prisma, nodeId);
    return all.map((recipe) => ({ ...recipe, portBusyBy: owners.get(Number(recipe.port || 443)) || null }));
  }

  private async nodeDomain(nodeId?: string) {
    if (nodeId) {
      const domain = await this.prisma.nodeDomain.findFirst({
        where: { nodeId, releasedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      // A foreign node's domain would give Reality a wrong SNI.
      return domain?.fqdn || null;
    }
    const fallback = await this.prisma.nodeDomain.findFirst({
      where: { releasedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return fallback?.fqdn || null;
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

  /** Recipe port if free on the node, otherwise the first free published port. */
  private async port(nodeId: string | undefined, preferred: number) {
    if (!nodeId) return { port: preferred, autoPort: false, busyBy: null as string | null };
    const owners = await nodeUsedPorts(this.prisma, nodeId);
    const port = pickFreePort(new Set(owners.keys()), preferred);
    if (!port) throw new BadRequestException('All published ports on this node are taken');
    return { port, autoPort: port !== preferred, busyBy: port !== preferred ? owners.get(preferred) || null : null };
  }

  /** Tags are globally unique; add a suffix instead of failing on the second use of a recipe. */
  private async uniqueTag(base: string) {
    const root = base.slice(0, 56);
    for (let i = 1; i < 100; i += 1) {
      const tag = i === 1 ? root : `${root}-${i}`;
      if (!(await this.prisma.inbound.findFirst({ where: { tag }, select: { id: true } }))) return tag;
    }
    return `${root}-${randomBytes(3).toString('hex')}`;
  }

  async prepare(id: string, input: { nodeId?: string; tag?: string }) {
    const recipe = (await this.list()).find((item) => item.id === id);
    if (!recipe) throw new NotFoundException('Inbound recipe not found');
    if ((recipe.generateKeys || recipe.security === 'reality') && !input.nodeId) {
      throw new BadRequestException('Select a node first: Reality uses the node domain as SNI');
    }
    const domain = await this.nodeDomain(input.nodeId);
    const preferred = Number(recipe.port || 443);
    const { port, autoPort, busyBy } = await this.port(input.nodeId, preferred);
    const settings: Record<string, unknown> = { ...(recipe.settings || {}) };
    if (recipe.generateKeys || recipe.security === 'reality') {
      if (!domain) throw new BadRequestException('Assign a domain to the node before applying a Reality recipe');
      const keys = this.keys();
      settings.publicHost = domain;
      settings.sni = domain;
      settings.realityDest = settings.realityDest || '127.0.0.1:8443';
      settings.realityServerNames = [domain];
      settings.realityPrivateKey = keys.privateKey;
      settings.realityPublicKey = keys.publicKey;
      settings.realityShortIds = [keys.shortId];
      settings.realityFingerprint = 'chrome';
      settings.spiderX = '/';
    }
    return {
      tag: await this.uniqueTag(input.tag || recipe.id),
      nodeId: input.nodeId || null,
      protocol: recipe.protocol || 'vless',
      transport: recipe.transport || 'tcp',
      security: recipe.security || 'none',
      port,
      autoPort,
      recipePort: preferred,
      portBusyBy: busyBy,
      listen: '0.0.0.0',
      flow: recipe.flow || null,
      path: recipe.path || null,
      sni: domain,
      serviceName: null,
      settings,
      enabled: true,
    };
  }
}
