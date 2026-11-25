import { ForbiddenException } from '@nestjs/common';
import { DnsAdminService } from './dns-admin.service';

describe('DnsAdminService', () => {
  let prisma: any;
  let dns: any;
  let settings: any;

  beforeEach(() => {
    delete process.env.PDNS_API_KEY;
    process.env.PANEL_MODE = 'control';
    prisma = {
      dnsSetting: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({})),
      },
    };
    dns = {
      serverInfo: jest.fn(async () => ({ version: '1.6.3', daemon_type: 'authoritative' })),
      zones: jest.fn(async () => [{ id: 'node.h2onetwork.pro.', name: 'node.h2onetwork.pro.', kind: 'Native', rrsets: [] }]),
      statistics: jest.fn(async () => [
        { name: 'udp-queries', value: '10' },
        { name: 'tcp-queries', value: '2' },
      ]),
      metrics: jest.fn(async () => ({ pdns_auth_uptime: 120, pdns_auth_latency: 3 })),
      zone: jest.fn(async () => ({ rrsets: [{ name: 'a.node.h2onetwork.pro.', type: 'A', ttl: 60, records: [{ content: '1.2.3.4' }] }] })),
      patchRrsets: jest.fn(async () => ({ ok: true })),
      createZone: jest.fn(async (name: string) => ({ id: name })),
      deleteZone: jest.fn(async (name: string) => ({ deleted: name })),
    };
    const { DnsSettingsService } = require('./dns-settings.service');
    settings = new DnsSettingsService(prisma);
  });

  const service = () => new DnsAdminService(dns, settings);

  afterEach(() => { delete process.env.PANEL_MODE; });

  it('reports status with metrics in control mode', async () => {
    const status = await service().status();
    expect(status).toMatchObject({ mode: 'control', available: true, version: '1.6.3', zones: 1, queries: 12 });
  });

  it('does not expose DNS in tenant mode', async () => {
    process.env.PANEL_MODE = 'tenant';
    await expect(service().zones()).rejects.toThrow(ForbiddenException);
  });

  it('flattens rrsets and patches records safely', async () => {
    const rows = await service().records('node.h2onetwork.pro.');
    expect(rows[0]).toMatchObject({ name: 'a.node.h2onetwork.pro.', type: 'A', content: '1.2.3.4' });
    await service().setRecord('node.h2onetwork.pro.', {
      name: 'a.node.h2onetwork.pro', type: 'A', ttl: 60, records: [{ content: '5.6.7.8' }],
    });
    expect(dns.patchRrsets.mock.calls[0][1][0]).toMatchObject({
      name: 'a.node.h2onetwork.pro.', type: 'A', changetype: 'REPLACE',
    });
  });

  it('never returns the API key from settings', async () => {
    process.env.PDNS_API_KEY = 'super-secret';
    const value = await service().getSettings();
    expect(value.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(value)).not.toContain('super-secret');
  });
});
