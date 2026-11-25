import { PowerDnsService } from './powerdns.service';

describe('PowerDnsService', () => {
  const originalFetch = global.fetch;
  let calls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    process.env.PDNS_API_KEY = 'test-key';
    process.env.PDNS_API_URL = 'http://powerdns:8081';
    process.env.NODE_DNS_ZONE = 'node.h2onetwork.pro';
    process.env.NODE_DNS_TTL = '60';
    calls = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 201, text: async () => '' } as any;
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const service = () => new PowerDnsService({
    config: jest.fn(async () => ({
      apiUrl: process.env.PDNS_API_URL || 'http://powerdns:8081',
      apiKey: process.env.PDNS_API_KEY || '',
      zone: process.env.NODE_DNS_ZONE || 'node.h2onetwork.pro',
      ttl: Number(process.env.NODE_DNS_TTL || 60),
      ns1: 'ns1.h2onetwork.pro.', ns2: 'ns2.h2onetwork.pro.', bindIp: '0.0.0.0', mode: 'control' as const,
    })),
  } as any);

  it('creates A and AAAA records with the configured TTL', async () => {
    await service().setAddress('abcdef123456', '203.0.113.10', '2001:db8::1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://powerdns:8081/api/v1/servers/localhost/zones/node.h2onetwork.pro');
    expect(calls[0].init.headers).toMatchObject({ 'X-API-Key': 'test-key' });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.rrsets.map((r: any) => r.type)).toEqual(['A', 'AAAA']);
    expect(body.rrsets[0]).toMatchObject({
      name: 'abcdef123456.node.h2onetwork.pro.',
      ttl: 60,
      changetype: 'REPLACE',
      records: [{ content: '203.0.113.10', disabled: false }],
    });
  });

  it('uses DELETE for TXT cleanup and removes all record types on release', async () => {
    const dns = service();
    await dns.removeTxt('abcdef123456');
    await dns.remove('abcdef123456');
    const types = calls.flatMap((call) => JSON.parse(String(call.init.body)).rrsets.map((r: any) => `${r.type}:${r.changetype}`));
    expect(types).toEqual(['TXT:DELETE', 'A:DELETE', 'AAAA:DELETE', 'TXT:DELETE']);
  });

  it('does not call the API when no key is configured', async () => {
    delete process.env.PDNS_API_KEY;
    await expect(service().setAddress('label', '203.0.113.1')).rejects.toThrow('API key is not configured');
    expect(calls).toHaveLength(0);
  });

  it('surfaces API errors', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 422, text: async () => 'bad zone' } as any)) as any;
    await expect(service().setAddress('label', '203.0.113.1')).rejects.toThrow('PowerDNS API error 422');
  });
});
