import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReverseService } from './reverse.service';

const admin = { userId: 'a', email: 'a@b.c', role: 'ADMIN' } as any;

describe('ReverseService', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      node: { findFirst: jest.fn(async () => ({ id: 'n1' })) },
      inbound: { findFirst: jest.fn(async () => ({ id: 'i1', tag: 'reality-in', port: 2054, settings: {} })) },
      reverseTunnel: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.organizationId === 'org-b' ? null : { id: 't1', organizationId: 'org-a' }),
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 't1', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
    };
  });

  const service = () => new ReverseService(prisma);

  const dto = { name: 'nat-node', nodeId: 'n1', portalInboundId: 'i1', publicPort: 2098, internalPort: 443 };

  it('creates a tunnel with a dedicated UUID and internal domain', async () => {
    const result: any = await service().create(dto, admin);
    expect(result.bridgeUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.reverseDomain).toMatch(/^rev-[0-9a-f]{8}\.xray\.internal$/);
    expect(result.internalAddress).toBe('127.0.0.1');
  });

  it('validates ports and requires a VLESS portal inbound', async () => {
    await expect(service().create({ ...dto, publicPort: 0 }, admin)).rejects.toThrow(BadRequestException);
    prisma.inbound.findFirst.mockResolvedValueOnce(null);
    await expect(service().create(dto, admin)).rejects.toThrow('VLESS inbound');
  });

  it('rejects unknown tunnels and does not expose other tenants', async () => {
    await expect(service().get('t1', { ...admin, role: 'OPERATOR', organizationId: 'org-b' })).rejects.toThrow(NotFoundException);
  });
});
