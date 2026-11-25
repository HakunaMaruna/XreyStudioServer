import { RoutingService } from './routing.service';

const admin = { userId: 'u', email: 'a@b.c', role: 'ADMIN' } as any;
const operator = { userId: 'o', email: 'o@b.c', role: 'OPERATOR', organizationId: 'org-a' } as any;

describe('RoutingService', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      routingProfile: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'p1' && where.organizationId === 'org-a' ? { id: 'p1', payload: {} } : null,
        ),
        create: jest.fn(async ({ data }: any) => data),
        update: jest.fn(async ({ data }: any) => data),
        delete: jest.fn(async () => ({})),
      },
    };
  });

  const service = () => new RoutingService(prisma);

  const validPayload = {
    dnsServers: ['9.9.9.9'],
    outbounds: [{ tag: 'xss-test-direct', protocol: 'freedom' }],
    routingRules: [
      { type: 'field', ip: ['10.0.0.0/8'], outboundTag: 'xss-test-direct' },
      { type: 'field', port: '53', outboundTag: 'direct' },
    ],
  };

  it('returns the curated recipes', () => {
    expect(service().recipes().map((r) => r.id)).toEqual(
      expect.arrayContaining(['local-dns-direct', 'ru-direct', 'block-ads', 'block-torrents', 'test-custom-outbound']),
    );
  });

  it('accepts a valid profile and rejects unknown outbound tags', () => {
    expect(service().validate(validPayload)).toEqual({ valid: true, errors: [] });
    const invalid = {
      ...validPayload,
      routingRules: [{ type: 'field', ip: ['10.0.0.0/8'], outboundTag: 'nowhere' }],
    };
    expect(service().validate(invalid).valid).toBe(false);
    expect(() => service().create({ name: 'bad', payload: invalid }, admin)).toThrow('Invalid routing profile');
  });

  it('rejects reserved and duplicate outbound tags', () => {
    const reserved = { outbounds: [{ tag: 'direct', protocol: 'freedom' }] };
    expect(service().validate(reserved).errors.join(' ')).toContain('reserved');
    const duplicate = {
      outbounds: [
        { tag: 'custom', protocol: 'freedom' },
        { tag: 'custom', protocol: 'freedom' },
      ],
    };
    expect(service().validate(duplicate).errors.join(' ')).toContain('duplicate');
  });

  it('requires at least one matcher in every rule', () => {
    const payload = { routingRules: [{ type: 'field', outboundTag: 'direct' }] };
    expect(service().validate(payload).errors.join(' ')).toContain('matcher');
  });

  it('scopes operators to their own organization', async () => {
    await service().list(operator);
    expect(prisma.routingProfile.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-a' },
      orderBy: { createdAt: 'desc' },
    });
    await expect(service().remove('foreign', operator)).rejects.toThrow('not found');
    expect(prisma.routingProfile.delete).not.toHaveBeenCalled();
  });

  it('stores recipe metadata and organization on create', async () => {
    const created = await service().create(
      { name: 'test', payload: validPayload, recipe: 'test-custom-outbound', organizationId: 'org-a' },
      admin,
    );
    expect(created).toMatchObject({ recipe: 'test-custom-outbound', organizationId: 'org-a' });
  });
});
