// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { CheburcheckService } from './cheburcheck.service';

const admin = { userId: 'a', email: 'a@b.c', role: 'ADMIN' } as any;
const operator = { userId: 'o', email: 'o@b.c', role: 'OPERATOR', organizationId: 'org-b' } as any;

const sse = (frames: Array<[string, unknown]>) => {
  const body = frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

describe('CheburcheckService', () => {
  const originalFetch = global.fetch;
  let prisma: any;
  let settings: any;
  let notifications: any;
  let calls: Array<{ url: string; init?: RequestInit }>;

  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn(async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const value = String(url);
      if (value.includes('/check?')) {
        return new Response(JSON.stringify({
          id: 'ctx-1', target: '203.0.113.10', target_type: 'IPv4-адрес', blocked: false,
          ips: ['203.0.113.10'], geo: { location: 'Россия' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (value.includes('/probe/')) {
        return sse([
          ['started', { id: 'ctx-1', online_probes: 2 }],
          ['result', { probe_id: '1', region: 'Москва', provider: 'MTS', verdicts: ['tspu_block'] }],
          ['done', { id: 'ctx-1', status: 'done', response_count: 1 }],
        ]);
      }
      return new Response('{}', { status: 200 });
    }) as any;
    prisma = {
      node: {
        findUnique: jest.fn(async () => ({ id: 'n1', address: '203.0.113.10', organizationId: 'org-a' })),
      },
      cheburcheckResult: {
        create: jest.fn(async ({ data }: any) => ({ id: 'r1', createdAt: new Date(), ...data })),
        findMany: jest.fn(async () => []),
      },
    };
    settings = { value: jest.fn(async (key: string) => (key === 'CHEBURCHECK_API_TOKEN' ? 'token' : undefined)) };
    notifications = { emit: jest.fn(async () => ({})) };
  });

  afterEach(() => { global.fetch = originalFetch; });

  const service = () => new CheburcheckService(prisma, settings, notifications);

  it('runs check, parses SSE and stores an alert for a blocked verdict', async () => {
    const result = await service().check({ nodeId: 'n1' }, admin);
    expect(result.verdict).toBe('tspu_block');
    expect(result.blocked).toBe(true);
    expect(result.probes).toHaveLength(1);
    expect(prisma.cheburcheckResult.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nodeId: 'n1', target: '203.0.113.10', verdict: 'tspu_block' }),
    }));
    expect(notifications.emit).toHaveBeenCalledWith('CHEBURCHECK_BLOCKED', expect.objectContaining({ severity: 'warning' }), 'org-a');
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('does not send the API token in the check URL', async () => {
    await service().check({ target: 'msc.h2onetwork.pro' }, admin);
    expect(calls[0].url).toContain('/check?target=msc.h2onetwork.pro');
    expect(calls[0].url).not.toContain('token');
    expect(calls[0].init?.headers).not.toHaveProperty('Authorization');
  });

  it('rejects invalid targets and foreign nodes', async () => {
    await expect(service().check({ target: 'bad target' }, admin)).rejects.toThrow('Invalid target');
    await expect(service().check({ nodeId: 'n1' }, operator)).rejects.toThrow('another organization');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a private self-hosted API URL in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    settings.value.mockImplementation(async (key: string) =>
      key === 'CHEBURCHECK_API_TOKEN' ? 'token' : key === 'CHEBURCHECK_BASE_URL' ? 'https://127.0.0.1/api/v1' : undefined);
    await expect(service().check({ target: 'example.com' }, admin)).rejects.toThrow('Private Cheburcheck API');
    process.env.NODE_ENV = previous;
  });

  it('works without a token (block lists only)', async () => {
    settings.value.mockImplementation(async () => undefined);
    const result = await service().check({ nodeId: 'n1' }, admin);
    expect(result.probeError).toContain('not configured');
    expect(result.verdict).toBe('unknown');
    expect(calls).toHaveLength(1);
  });
});
