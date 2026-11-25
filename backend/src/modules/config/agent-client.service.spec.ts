import { AgentClientService } from './agent-client.service';

describe('AgentClientService base URL', () => {
  const service = new AgentClientService();
  const previous = {
    AGENT_BASE_URL: process.env.AGENT_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PRIVATE_AGENT_URLS: process.env.ALLOW_PRIVATE_AGENT_URLS,
    ALLOW_HTTP_AGENT_URLS: process.env.ALLOW_HTTP_AGENT_URLS,
  };
  const base = (node: { address: string; agentUrl?: string | null }) => (service as any).base(node);

  afterAll(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the internal agent service when no node URL is configured', () => {
    process.env.AGENT_BASE_URL = 'http://agent:9090';
    expect(base({ address: '127.0.0.1' })).toBe('http://agent:9090');
  });

  it('keeps the address fallback outside Compose/K8s', () => {
    delete process.env.AGENT_BASE_URL;
    expect(base({ address: '203.0.113.5' })).toBe('http://203.0.113.5:9090');
  });

  it('prefers an explicit node agentUrl', () => {
    process.env.AGENT_BASE_URL = 'http://agent:9090';
    expect(base({ address: '10.0.0.5', agentUrl: 'https://node.example.com:9090/' })).toBe(
      'https://node.example.com:9090',
    );
  });

  it('requires https for explicit agent URLs in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRIVATE_AGENT_URLS;
    delete process.env.ALLOW_HTTP_AGENT_URLS;
    expect(() => base({ address: '203.0.113.5', agentUrl: 'http://node.example.com:9090' })).toThrow(
      /https/,
    );
    expect(base({ address: '203.0.113.5', agentUrl: 'https://node.example.com:9090' })).toBe(
      'https://node.example.com:9090',
    );
  });

  it('allows explicit http agent URLs when ALLOW_HTTP_AGENT_URLS is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_HTTP_AGENT_URLS = 'true';
    delete process.env.ALLOW_PRIVATE_AGENT_URLS;
    expect(base({ address: '203.0.113.5', agentUrl: 'http://node.example.com:9090' })).toBe(
      'http://node.example.com:9090',
    );
    expect(() => base({ address: '203.0.113.5', agentUrl: 'http://10.0.0.5:9090' })).toThrow(/Private/);
    delete process.env.ALLOW_HTTP_AGENT_URLS;
  });

  it('rejects derived private/http hosts, query strings and mapped IPv6', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AGENT_BASE_URL;
    delete process.env.ALLOW_HTTP_AGENT_URLS;
    delete process.env.ALLOW_PRIVATE_AGENT_URLS;
    expect(() => base({ address: 'node.example.com' })).toThrow(/https/);
    expect(() => base({ address: 'localhost', agentUrl: 'https://localhost:9090' })).toThrow();
    expect(() => base({ address: 'node.example.com', agentUrl: 'https://node.example.com:9090?x=1' })).toThrow(/query/);
    expect(() => base({ address: 'node.example.com', agentUrl: 'https://[::ffff:127.0.0.1]:9090' })).toThrow(/IPv6|Private|Link-local/);
  });

  it('allows internal http and explicit opt-in for private agent URLs', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_PRIVATE_AGENT_URLS = 'true';
    delete process.env.AGENT_BASE_URL;
    expect(base({ address: '203.0.113.5' })).toBe('http://203.0.113.5:9090');
    expect(base({ address: '203.0.113.5', agentUrl: 'http://agent.lan:9090' })).toBe(
      'http://agent.lan:9090',
    );
    delete process.env.ALLOW_PRIVATE_AGENT_URLS;
  });
});
