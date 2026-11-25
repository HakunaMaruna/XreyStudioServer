import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DnsProfilesService } from './dns-profiles.service';

const admin = { userId: 'a', email: 'a@b.c', role: 'ADMIN' } as any;
const operator = { userId: 'o', email: 'o@b.c', role: 'OPERATOR', organizationId: 'org-a' } as any;

describe('DnsProfilesService', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      dnsProfile: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'p1' && where.organizationId === 'org-a' ? { id: 'p1', organizationId: 'org-a' } : null),
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
    };
  });

  const service = () => new DnsProfilesService(prisma);

  it('validates hosts, servers and options', () => {
    expect(service().validate({
      hosts: { 'example.com': '1.2.3.4' },
      servers: [{ address: 'https://1.1.1.1/dns-query', domains: ['geosite:cn'], skipFallback: true }],
      options: { queryStrategy: 'UseIP' },
    })).toEqual({ valid: true, errors: [] });

    expect(service().validate({ servers: [{ address: 'ftp://bad', unknown: 1 }] }).valid).toBe(false);
    expect(service().validate({ servers: ['localhost'], options: { bad: true } }).errors).toContain('options.bad is not supported');
    expect(service().validate({ servers: ['localhost'], hosts: { x: 42 } }).valid).toBe(false);
  });

  it('rejects a profile with no servers', async () => {
    await expect(service().create({ name: 'x', servers: [] } as any, admin)).rejects.toThrow(BadRequestException);
  });

  it('scopes operators to their organization', async () => {
    await expect(service().get('p1', operator)).resolves.toMatchObject({ id: 'p1' });
    await expect(service().get('p1', { ...operator, organizationId: 'org-b' })).rejects.toThrow('not found');
    await expect(service().create({ name: 'x', servers: ['localhost'], organizationId: 'org-b' } as any, operator)).rejects.toThrow(ForbiddenException);
  });

  it('merges enabled profiles into a single DNS object', async () => {
    prisma.dnsProfile.findMany.mockResolvedValueOnce([
      { hosts: { 'a.example.com': '1.2.3.4' }, servers: ['localhost'], options: { queryStrategy: 'UseIP' } },
      { hosts: { 'b.example.com': '5.6.7.8' }, servers: [{ address: 'https://1.1.1.1/dns-query' }], options: { disableFallback: true } },
    ]);
    const dns: any = await service().buildForConfig();
    expect(dns.servers).toHaveLength(2);
    expect(dns.hosts).toEqual({ 'a.example.com': '1.2.3.4', 'b.example.com': '5.6.7.8' });
    expect(dns).toMatchObject({ queryStrategy: 'UseIP', disableFallback: true });
  });
});
