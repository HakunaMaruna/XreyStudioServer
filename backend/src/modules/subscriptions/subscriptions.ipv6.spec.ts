// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService IPv6 entry', () => {
  it('adds an IPv6 twin for a VLESS inbound on an IPv6-enabled node', async () => {
    const prisma: any = {
      subscriptionTemplate: { findFirst: jest.fn(async () => null) },
    };
    const service = new SubscriptionsService(prisma, {} as any, { subscriptionServers: jest.fn(async () => []) } as any, { resolve: jest.fn(async () => []) } as any);
    (service as any).loadUser = jest.fn(async () => ({
      id: 'u1', email: 'u@example.com', status: 'ACTIVE', trafficLimit: 0n, trafficUsed: 0n,
      organizationId: null, inbounds: [{
        id: 'i1', tag: 'wizard-test', protocol: 'vless', transport: 'tcp', security: 'reality',
        port: 443, enabled: true, settings: {
          publicHost: 'node.example.com', realityPublicKey: 'pbk', realityShortIds: ['sid'],
          realityServerNames: ['node.example.com'], realityFingerprint: 'chrome', flow: 'xtls-rprx-vision',
        },
        node: { id: 'n1', name: 'n1', ipv6Enabled: true, ipv6Address: '2001:db8::1' },
      }],
      inboundClients: [], devices: [], subscriptionTemplate: null, organization: null,
    }));
    (service as any).effectiveTemplate = jest.fn(async () => null);
    const status: any = await service.getStatus('token');
    const ipv6 = status.links.find((link: any) => link.id === 'i1-ipv6');
    expect(ipv6).toBeTruthy();
    expect(ipv6.link).toContain('@[2001:db8::1]:443');
    expect(ipv6.link).toContain('pbk=pbk');
    expect(decodeURIComponent(ipv6.link.split('#')[1])).toBe('wizard-test · IPv6');
  });
});
