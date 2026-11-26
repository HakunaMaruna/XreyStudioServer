import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PluginRecipeService } from '../plugins/plugin-recipe.service';

export type InboundRecipe = {
  id: string;
  name: string;
  description?: string;
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
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 443,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-reality-alt', name: 'VLESS Reality (alt port)', source: 'builtin',
    description: 'Same as the default but on port 2054 for testing multiple connections.',
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 2054,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-reality-4436', name: 'VLESS Reality (4436)', source: 'builtin',
    description: 'Reality on port 4436; publish this port on the node.',
    protocol: 'vless', transport: 'tcp', security: 'reality', port: 4436,
    flow: 'xtls-rprx-vision', generateKeys: true,
  },
  {
    id: 'vless-plain', name: 'VLESS (no TLS)', source: 'builtin',
    description: 'Plain VLESS on port 2053 for a quick transport check.',
    protocol: 'vless', transport: 'tcp', security: 'none', port: 2053,
  },
  {
    id: 'vmess-ws', name: 'VMess WebSocket', source: 'builtin',
    description: 'VMess over WebSocket with /ws path on port 2053.',
    protocol: 'vmess', transport: 'ws', security: 'none', port: 2053, path: '/ws',
  },
];

@Injectable()
export class InboundRecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginRecipes: PluginRecipeService,
  ) {}

  async list(): Promise<InboundRecipe[]> {
    const plugin = await this.pluginRecipes.listForInbounds().catch(() => []);
    return [...BUILTIN, ...plugin];
  }

  private async nodeDomain(nodeId?: string) {
    if (nodeId) {
      const domain = await this.prisma.nodeDomain.findFirst({
        where: { nodeId, releasedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (domain) return domain.fqdn;
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

  async prepare(id: string, input: { nodeId?: string; tag?: string }) {
    const recipe = (await this.list()).find((item) => item.id === id);
    if (!recipe) throw new NotFoundException('Inbound recipe not found');
    const domain = await this.nodeDomain(input.nodeId);
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
      tag: input.tag || recipe.id,
      nodeId: input.nodeId || null,
      protocol: recipe.protocol || 'vless',
      transport: recipe.transport || 'tcp',
      security: recipe.security || 'none',
      port: Number(recipe.port || 443),
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
