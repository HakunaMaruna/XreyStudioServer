import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QA v2.15 issue 125: end-to-end coverage of the read-only MCP bridge.
 * The real Nest application and MCP SDK are used; only Prisma is replaced with
 * a delegate mock so no database fixtures are needed.
 */
const MCP_TOKEN = 'e2e-mcp-token-qa-v215';
const JWT_SECRET = 'e2e-test-jwt-secret';

describe('MCP bridge /api/mcp (e2e, QA v2.15)', () => {
  let app: INestApplication;
  let server: any;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    savedEnv.MCP_TOKEN = process.env.MCP_TOKEN;
    savedEnv.JWT_SECRET = process.env.JWT_SECRET;
    process.env.MCP_TOKEN = MCP_TOKEN;
    process.env.JWT_SECRET = JWT_SECRET;

    const prisma = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      onModuleInit: jest.fn(),
      enableShutdownHooks: jest.fn(),
      user: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      node: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
      },
      subscriptionTemplate: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      healthCheck: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      inbound: { findMany: jest.fn().mockResolvedValue([]) },
      geodataCategory: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ['MCP_TOKEN', 'JWT_SECRET']) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  const adminJwt = () =>
    new JwtService({ secret: JWT_SECRET }).sign({ sub: 'admin-1', username: 'admin', role: 'ADMIN' });

  const rpc = (body: unknown, headers: Record<string, string> = {}) =>
    request(server)
      .post('/api/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set(headers)
      .send(body);

  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'qa-v215', version: '1.0.0' },
    },
  };

  const parseRpc = (response: request.Response): any => {
    if (response.body?.jsonrpc) return response.body;
    const text = String(response.text || '');
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') return JSON.parse(payload);
      }
    }
    throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 300)}`);
  };

  // The transport is stateless: no session id is issued, so tools/list and
  // tools/call are self-contained requests authenticated by the same header.
  const initialize = async (headers: Record<string, string>): Promise<void> => {
    const response = await rpc(initRequest, headers).expect(200);
    expect(parseRpc(response).result?.protocolVersion).toBeDefined();
  };

  it('rejects initialize and tools/list without a token (401)', async () => {
    await rpc(initRequest).expect(401);
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(401);
  });

  it('rejects an invalid MCP token and an invalid JWT (401)', async () => {
    await rpc(initRequest, { 'X-MCP-Token': 'wrong-token' }).expect(401);
    await rpc(initRequest, { Authorization: 'Bearer not-a-jwt' }).expect(401);
  });

  it('accepts X-MCP-Token and a valid admin JWT', async () => {
    const byToken = await rpc(initRequest, { 'X-MCP-Token': MCP_TOKEN }).expect(200);
    expect(parseRpc(byToken).result?.protocolVersion).toBeDefined();

    const byJwt = await rpc({ ...initRequest, id: 3 }, { Authorization: `Bearer ${adminJwt()}` }).expect(200);
    expect(parseRpc(byJwt).result?.protocolVersion).toBeDefined();
  });

  it('initializes, lists read-only tools and calls them via the SDK over Streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1/api/mcp'), {
      requestInit: { headers: { 'X-MCP-Token': MCP_TOKEN } },
    });
    const client = new Client({ name: 'qa-v215', version: '1.0.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'panel_status',
          'list_users',
          'list_nodes',
          'health_summary',
          'list_inbounds',
          'list_subscription_templates',
          'geodata_search',
        ]),
      );

      const writeLike = names.filter((name) =>
        /^(create|update|delete|remove|set|add|patch|revoke|restart|stop|start)[-_]/i.test(name),
      );
      expect(writeLike).toEqual([]);

      const result = await client.callTool({ name: 'panel_status', arguments: {} });
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.isError).not.toBe(true);
      expect(result.content[0]).toMatchObject({ type: 'text' });
      expect(JSON.parse(String((result.content[0] as any).text))).toMatchObject({
        version: '2.15.5',
        users: 3,
        nodes: 2,
      });
    } finally {
      await client.close();
    }
  });

  it('supports initialize -> tools/list -> tools/call as stateless requests', async () => {
    await initialize({ 'X-MCP-Token': MCP_TOKEN });
    const list = await rpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'X-MCP-Token': MCP_TOKEN },
    ).expect(200);
    const tools = parseRpc(list).result.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.map((tool: any) => tool.name)).toContain('panel_status');

    const call = await rpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'panel_status', arguments: {} } },
      { 'X-MCP-Token': MCP_TOKEN },
    ).expect(200);
    expect(Array.isArray(parseRpc(call).result.content)).toBe(true);
  });

  it('rejects a tool name that does not exist', async () => {
    await initialize({ 'X-MCP-Token': MCP_TOKEN });
    const response = await rpc(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_user', arguments: {} } },
      { 'X-MCP-Token': MCP_TOKEN },
    ).expect(200);
    const payload = parseRpc(response);
    expect(payload.error || payload.result?.isError === true).toBeTruthy();
  });
});
