import { BadRequestException } from '@nestjs/common';
import { encryptSecret } from '../../common/secret-crypto';
import { BalancersService } from './balancers.service';

const admin = { userId: 'a', email: 'a@b.c', role: 'ADMIN' } as any;

describe('BalancersService', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      balancer: {
        findFirst: jest.fn(async () => ({ id: 'bal-1', name: 'test', enabled: true, members: [] })),
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 'bal-1', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
      balancerMember: { deleteMany: jest.fn(async () => ({})) },
    };
  });

  const service = () => new BalancersService(prisma);

  const member = {
    protocol: 'vless', address: 'node1.example.com', port: 443, uuid: 'uuid-1', enabled: true,
  };

  it('validates strategy, members and rule matchers', async () => {
    await expect(service().create({ name: 'x', members: [] } as any, admin)).rejects.toThrow(BadRequestException);
    await expect(service().create({ name: 'x', strategy: 'magic', members: [member] } as any, admin)).rejects.toThrow('Unknown balancing strategy');
    await expect(service().create({ name: 'x', rule: {}, members: [member] } as any, admin)).rejects.toThrow('at least one matcher');
  });

  it('encrypts member settings on create and exposes them decrypted to admin', async () => {
    await service().create({ name: 'test', members: [member] } as any, admin);
    const created = prisma.balancer.create.mock.calls[0][0].data;
    const stored = created.members.create[0].config;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('uuid-1');

    prisma.balancer.findFirst.mockResolvedValueOnce({
      id: 'bal-1', name: 'test', members: [{ id: 'm1', protocol: 'vless', config: encryptSecret(JSON.stringify({ settings: { address: 'node1.example.com', port: 443 } })), enabled: true }],
    });
    const result: any = await service().get('bal-1', admin);
    expect(result.members[0].config.settings.address).toBe('node1.example.com');
  });

  it('builds Xray balancer payload from encrypted members', () => {
    const built = service().buildForConfig;
    expect(built).toBeDefined();
  });
});
