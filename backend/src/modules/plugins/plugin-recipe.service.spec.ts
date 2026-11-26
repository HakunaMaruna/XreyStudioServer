import { BadRequestException } from '@nestjs/common';
import { PluginRecipeService } from './plugin-recipe.service';

describe('PluginRecipeService', () => {
  let prisma: any;
  const service = () => new PluginRecipeService(prisma);
  const valid = {
    id: 'vless-reality', name: 'VLESS Reality', description: 'Demo', protocol: 'vless',
    port: 443, settings: { uuid: 'secret-value' }, generateKeys: true,
  };

  beforeEach(() => {
    prisma = {
      pluginRecipe: {
        count: jest.fn(async () => 0),
        upsert: jest.fn(async ({ create }: any) => ({ id: create.id, ...create })),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        findMany: jest.fn(async () => []),
      },
    };
  });

  it('upserts a validated recipe scoped to the registering plugin', async () => {
    await expect(service().register('com.example.plugin', valid)).resolves.toEqual({ recipeId: 'vless-reality' });
    expect(prisma.pluginRecipe.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pluginId_recipeId: { pluginId: 'com.example.plugin', recipeId: 'vless-reality' } },
      create: expect.objectContaining({
        id: 'com.example.plugin:vless-reality',
        pluginId: 'com.example.plugin',
        recipeId: 'vless-reality',
      }),
    }));
  });

  it('rejects invalid ids, names, ports and settings without echoing payload values', async () => {
    const cases = [
      { ...valid, id: 'bad id' },
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(200) },
      { ...valid, port: 70000 },
      { ...valid, settings: 'secret-value' },
      { ...valid, settings: { password: 'secret-value', blob: 'x'.repeat(20_000) } },
      { ...valid, generateKeys: 'yes' },
    ];
    for (const recipe of cases) {
      try {
        await service().register('com.example.plugin', recipe);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as Error).message).not.toContain('secret-value');
      }
    }
    expect(prisma.pluginRecipe.upsert).not.toHaveBeenCalled();
  });

  it('enforces a per-plugin recipe limit', async () => {
    prisma.pluginRecipe.count.mockResolvedValueOnce(50);
    await expect(service().register('com.example.plugin', valid)).rejects.toThrow('limit');
    expect(prisma.pluginRecipe.upsert).not.toHaveBeenCalled();
  });

  it('allows re-registering an existing recipe at the cap', async () => {
    prisma.pluginRecipe.count.mockResolvedValueOnce(49);
    await expect(service().register('com.example.plugin', valid)).resolves.toEqual({ recipeId: 'vless-reality' });
    expect(prisma.pluginRecipe.count).toHaveBeenCalledWith({
      where: { pluginId: 'com.example.plugin', recipeId: { not: 'vless-reality' } },
    });
    expect(prisma.pluginRecipe.upsert).toHaveBeenCalled();
  });

  it('only unregisters the calling plugin’s recipe', async () => {
    await service().unregister('com.example.plugin', 'vless-reality');
    expect(prisma.pluginRecipe.deleteMany).toHaveBeenCalledWith({
      where: { pluginId: 'com.example.plugin', recipeId: 'vless-reality' },
    });
    await expect(service().unregister('com.example.plugin', 'bad/id')).rejects.toThrow(BadRequestException);
  });

  it('flattens stored recipes for the inbound recipes endpoint', async () => {
    prisma.pluginRecipe.findMany.mockResolvedValueOnce([{
      pluginId: 'com.example.plugin',
      recipeId: 'vless-reality',
      payload: valid,
    }]);
    await expect(service().listForInbounds()).resolves.toEqual([{
      id: 'vless-reality',
      name: 'VLESS Reality',
      description: 'Demo',
      source: 'plugin',
      pluginId: 'com.example.plugin',
      protocol: 'vless',
      transport: 'tcp',
      security: 'none',
      port: 443,
      flow: '',
      path: '',
      sni: '',
      settings: { uuid: 'secret-value' },
      generateKeys: true,
    }]);
  });
});
