// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ControlService } from './control.service';

const ctx = { tokenId: 't', userId: 'u', role: 'ADMIN' as any, organizationId: 'org-1', scopes: [] as any[] };

describe('ControlService', () => {
  let prisma: any;
  let dns: any;

  beforeEach(() => {
    prisma = {
      nodeDomain: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async ({ where }: any) =>
          where.tenantOrgId === 'org-1' ? { id: 'domain-1', label: 'label1', fqdn: 'label1.node.h2onetwork.pro' } : null,
        ),
        create: jest.fn(async ({ data }: any) => ({ id: 'new-id', ...data })),
        update: jest.fn(async ({ data }: any) => ({ ...data })),
        findMany: jest.fn(async () => []),
      },
      node: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.organizationId === 'org-1' && where.id === 'node-1' ? { id: 'node-1' } : null,
        ),
      },
    };
    dns = {
      isConfigured: jest.fn(async () => true),
      zoneName: jest.fn(async () => 'node.h2onetwork.pro'),
      setAddress: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
    };
  });

  const service = () => new ControlService(prisma, dns);

  it('generates a 12-hex label and binds it to the tenant', async () => {
    const result = await service().allocate({ ipv4: '203.0.113.7', location: 'RU' }, ctx);
    expect(result.label).toMatch(/^[0-9a-f]{12}$/);
    expect(result.fqdn).toBe(`${result.label}.node.h2onetwork.pro`);
    expect(result.tenantOrgId).toBe('org-1');
    expect(dns.setAddress).toHaveBeenCalledWith(result.label, '203.0.113.7', undefined);
  });

  it('retries when the generated label already exists', async () => {
    prisma.nodeDomain.findUnique
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValueOnce(null);
    const result = await service().allocate({ ipv4: '203.0.113.8' }, ctx);
    expect(prisma.nodeDomain.findUnique).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('new-id');
  });

  it('rejects invalid addresses and unconfigured DNS', async () => {
    await expect(service().allocate({ ipv4: 'not-an-ip' }, ctx)).rejects.toThrow('Invalid IPv4');
    dns.isConfigured.mockResolvedValueOnce(false);
    await expect(service().allocate({ ipv4: '203.0.113.1' }, ctx)).rejects.toThrow('not configured');
    expect(prisma.nodeDomain.create).not.toHaveBeenCalled();
  });

  it('does not release domains of another tenant', async () => {
    await expect(service().release('domain-1', { ...ctx, organizationId: 'org-2' })).rejects.toThrow('not found');
    expect(dns.remove).not.toHaveBeenCalled();
    await service().release('domain-1', ctx);
    expect(dns.remove).toHaveBeenCalledWith('label1');
    expect(prisma.nodeDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ releasedAt: expect.any(Date) }) }),
    );
  });

  it('binds a node only for the owning tenant', async () => {
    const result = await service().bindNode('domain-1', 'node-1', ctx);
    expect(result).toMatchObject({ nodeId: 'node-1' });
    await expect(service().bindNode('domain-1', 'node-1', { ...ctx, organizationId: 'org-2' })).rejects.toThrow('not found');
    await expect(service().bindNode('domain-1', 'node-2', ctx)).rejects.toThrow('Node not found');
  });
});
