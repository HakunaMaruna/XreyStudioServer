import { PluginStatus } from '@prisma/client';
import { PluginManagerService } from './plugin-manager.service';
import { PluginPackage } from './plugin-package';

const pkg: PluginPackage = {
  format: 'xss-plugin/1',
  manifest: {
    id: 'com.example.test', name: 'Test', version: '1.0.0', author: 'A', description: 'D',
    license: 'MIT', minPanelVersion: '2.38.0', maxPanelVersion: null, dependencies: [],
    permissions: ['users:read'],
    entrypoints: { backend: 'backend/index.js', frontend: null, migrations: null },
    hooks: ['onInstall', 'onEnable', 'onDisable'], settingsSchema: {}, healthcheck: 'health', i18n: {},
  },
  files: { 'backend/index.js': Buffer.from('module.exports = {}').toString('base64') },
  signature: null,
};

describe('PluginManagerService', () => {
  let prisma: any;
  let storage: any;
  let runtime: any;
  let snapshots: any;
  let audit: any;
  let notifications: any;
  let catalog: any;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PLUGIN_ALLOW_UNSIGNED = 'true';
    process.env.PLUGIN_AUTO_SNAPSHOT = 'false';
    prisma = {
      plugin: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({})),
      },
      pluginLog: { count: jest.fn(async () => 0), create: jest.fn(async ({ data }: any) => data), findMany: jest.fn(async () => []) },
      pluginStorage: { deleteMany: jest.fn(async () => ({})) },
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    storage = {
      artifactDir: jest.fn(async () => '/tmp/plugin'),
      unpack: jest.fn(async () => '/tmp/plugin'),
      removeArtifacts: jest.fn(async () => undefined),
      backupArtifacts: jest.fn(async () => '/tmp/plugin.previous'),
      restoreArtifacts: jest.fn(async () => undefined),
      manifest: jest.fn(async () => pkg.manifest),
      settings: jest.fn(async () => ({})),
      setSettings: jest.fn(async () => ({})),
      log: jest.fn(async () => ({})),
      get: jest.fn(async () => null), set: jest.fn(async () => ({})), delete: jest.fn(async () => ({})),
    };
    runtime = { invoke: jest.fn(async () => ({ ok: true })) };
    snapshots = { create: jest.fn(async () => ({})) };
    audit = { log: jest.fn(async () => ({})) };
    notifications = { broadcast: jest.fn(async () => ({})) };
    catalog = { assertNotRevoked: jest.fn(async () => undefined), assertPolicyAllowed: jest.fn(async () => undefined) };
  });

  const service = () => new PluginManagerService(prisma, storage, runtime, snapshots, audit, notifications, catalog);

  it('installs an unsigned package in dev mode and audits it', async () => {
    const result: any = await service().install(pkg);
    expect(result.pluginId).toBe('com.example.test');
    expect(storage.unpack).toHaveBeenCalled();
    expect(runtime.invoke).toHaveBeenCalledWith('com.example.test', 'onInstall', expect.anything());
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'plugin.install' }));
  });

  it('rolls back artifacts and metadata when onUpdate fails', async () => {
    prisma.plugin.findUnique.mockResolvedValue({
      id: 'p1', pluginId: 'com.example.test', version: '0.9.0',
      manifest: pkg.manifest, permissions: pkg.manifest.permissions, signature: null,
      status: PluginStatus.ENABLED,
    } as any);
    runtime.invoke.mockRejectedValueOnce(new Error('bad migration'));
    const next = JSON.parse(JSON.stringify(pkg));
    next.manifest.version = '1.1.0';
    await expect(service().update('com.example.test', next)).rejects.toThrow('bad migration');
    expect(storage.backupArtifacts).toHaveBeenCalledWith('com.example.test');
    expect(storage.restoreArtifacts).toHaveBeenCalledWith('com.example.test');
    expect(prisma.plugin.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: '0.9.0' }),
    }));
    expect(prisma.plugin.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PluginStatus.QUARANTINED }),
    }));
  });

  it('quarantines a plugin after repeated failures', async () => {
    prisma.plugin.findUnique.mockResolvedValue({ id: 'p1', pluginId: 'com.example.test', status: PluginStatus.ENABLED, manifest: pkg.manifest });
    prisma.pluginLog.count.mockResolvedValue(5);
    await service().recordFailure('com.example.test', 'boom');
    expect(prisma.plugin.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PluginStatus.QUARANTINED }),
    }));
    expect(notifications.broadcast).toHaveBeenCalled();
  });

  it('does not allow API calls without plugins:api permission', async () => {
    prisma.plugin.findUnique.mockResolvedValue({ id: 'p1', pluginId: 'com.example.test', status: PluginStatus.ENABLED, manifest: pkg.manifest });
    await expect(service().call('com.example.test', 'do', {}, { role: 'ADMIN' } as any)).rejects.toThrow('plugins:api');
  });
});
