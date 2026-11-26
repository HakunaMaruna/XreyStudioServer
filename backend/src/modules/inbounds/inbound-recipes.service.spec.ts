import { InboundRecipesService } from './inbound-recipes.service';

const pluginRecipes = {
  listForInbounds: jest.fn(async () => []),
} as any;

const prisma = {
  nodeDomain: {
    findFirst: jest.fn(async () => ({ fqdn: 'abc123.node.h2onetwork.pro' })),
  },
} as any;

describe('InboundRecipesService', () => {
  const service = new InboundRecipesService(prisma, pluginRecipes);

  beforeEach(() => jest.clearAllMocks());

  it('lists built-in and plugin recipes', async () => {
    pluginRecipes.listForInbounds.mockResolvedValueOnce([{
      id: 'plugin-recipe', name: 'Plugin', description: '', source: 'plugin', pluginId: 'com.example.p',
      protocol: 'vless', transport: 'tcp', security: 'reality', port: 4443, flow: 'xtls-rprx-vision',
      path: '', sni: '', settings: {}, generateKeys: true,
    }]);
    const rows = await service.list();
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([
      'vless-reality-selfsni', 'vless-reality-alt', 'vless-reality-4436', 'vless-plain', 'vmess-ws', 'plugin-recipe',
    ]));
  });

  it.each(['vless-reality-selfsni', 'vless-reality-alt', 'vless-reality-4436'])(
    'generates complete Reality settings for %s', async (id) => {
      const dto: any = await service.prepare(id, { nodeId: 'n1', tag: 'Helsinki' });
      expect(dto).toMatchObject({
        protocol: 'vless', security: 'reality', flow: 'xtls-rprx-vision',
        sni: 'abc123.node.h2onetwork.pro',
      });
      expect(dto.settings.realityDest).toBe('127.0.0.1:8443');
      expect(dto.settings.realityServerNames).toEqual(['abc123.node.h2onetwork.pro']);
      expect(dto.settings.realityPrivateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(dto.settings.realityPublicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(dto.settings.realityShortIds[0]).toMatch(/^[0-9a-f]{16}$/);
    },
  );

  it('prepares non-Reality recipes without keys', async () => {
    const dto: any = await service.prepare('vmess-ws', { nodeId: 'n1' });
    expect(dto).toMatchObject({ protocol: 'vmess', transport: 'ws', security: 'none', path: '/ws' });
    expect(dto.settings.realityPrivateKey).toBeUndefined();
  });

  it('rejects an unknown recipe', async () => {
    await expect(service.prepare('missing', {})).rejects.toThrow('not found');
  });
});
