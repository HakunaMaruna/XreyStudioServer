import { ExternalLinksService } from './external-links.service';

describe('ExternalLinksService', () => {
  const prisma: any = {
    userExternalLink: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'l1', ...data })),
      delete: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
  };
  const service = new ExternalLinksService(prisma);

  it('accepts a share link and rejects private subscription URLs', async () => {
    const row = await service.create('u1', { kind: 'link', value: 'vless://id@example.com:443?security=reality#test' });
    expect(row.kind).toBe('link');
    await expect(service.create('u1', { kind: 'subscription', value: 'http://127.0.0.1/sub' })).rejects.toThrow();
  });

  it('decodes a base64 subscription body into share links', async () => {
    const links = service['decodeBody'](Buffer.from('vless://a@example.com:443\ntrojan://b@example.com:443\n# comment').toString('base64'));
    expect(links).toEqual(['vless://a@example.com:443', 'trojan://b@example.com:443']);
  });
});
