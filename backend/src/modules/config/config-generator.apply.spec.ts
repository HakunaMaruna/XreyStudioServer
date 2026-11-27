import { BadRequestException } from '@nestjs/common';
import { ConfigGeneratorService } from './config-generator.service';

describe('ConfigGeneratorService applyRevision', () => {
  it('throws and does not mark a revision applied when the agent rejects the config', async () => {
    const prisma: any = {
      node: { findUnique: jest.fn(async () => ({ id: 'n1', name: 'n1', organizationId: null })) },
      configRevision: {
        findFirst: jest.fn(async () => ({ id: 'r1', version: 2, content: JSON.stringify({ inbounds: [], outbounds: [] }) })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async () => []),
    };
    const agent: any = { applyConfig: jest.fn(async () => ({ applied: false, error: 'Agent responded 403' })) };
    const service = new ConfigGeneratorService(prisma, agent, { emit: jest.fn() } as any, {} as any, {} as any);
    await expect(service.applyRevision('n1', 'r1')).rejects.toThrow(BadRequestException);
    expect(prisma.configRevision.update).not.toHaveBeenCalled();
  });
});
