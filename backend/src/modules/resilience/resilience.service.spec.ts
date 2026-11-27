// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ResilienceService } from './resilience.service';

describe('ResilienceService', () => {
  it('rotates Reality shortIds and creates config revisions for affected nodes', async () => {
    const updated: any[] = [];
    const prisma: any = {
      inbound: {
        findMany: jest.fn(async () => [{
          id: 'i1', nodeId: 'n1', sni: 'old.example.com',
          settings: { realityServerNames: ['old.example.com'], realityShortIds: ['oldid'] },
        }]),
        update: jest.fn(async (args: any) => { updated.push(args); return args; }),
      },
    };
    const configGenerator: any = { createRevision: jest.fn(async () => ({})) };
    const service = new ResilienceService(prisma, configGenerator);
    const result = await service.rotateSni();
    expect(result.rotated).toBe(1);
    expect(result.nodes).toEqual(['n1']);
    const settings = updated[0].data.settings;
    expect(settings.realityShortIds[0]).not.toBe('oldid');
    expect(configGenerator.createRevision).toHaveBeenCalledWith('n1');
  });

  it('quarantines an exit address and regenerates the node config', async () => {
    const prisma: any = {
      nodeQuarantine: { upsert: jest.fn(async () => ({ address: '1.2.3.4' })) },
      node: { findFirst: jest.fn(async () => ({ id: 'n1' })) },
    };
    const configGenerator: any = { createRevision: jest.fn(async () => ({})) };
    const service = new ResilienceService(prisma, configGenerator);
    const result = await service.quarantine({ address: '1.2.3.4', reason: 'test', hours: 48 });
    expect(result.address).toBe('1.2.3.4');
    expect(configGenerator.createRevision).toHaveBeenCalledWith('n1');
  });
});
