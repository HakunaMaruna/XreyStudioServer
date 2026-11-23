import { AgentClientService } from './agent-client.service';

describe('AgentClientService base URL', () => {
  const service = new AgentClientService();
  const previous = process.env.AGENT_BASE_URL;
  const base = (node: { address: string; agentUrl?: string | null }) => (service as any).base(node);

  afterAll(() => {
    if (previous === undefined) delete process.env.AGENT_BASE_URL;
    else process.env.AGENT_BASE_URL = previous;
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
});
