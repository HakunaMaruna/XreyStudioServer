// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_VERSION } from '../src/version';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QA v2.15 issue 125: end-to-end coverage of the read-only MCP bridge.
 * Uses the real Nest application and MCP SDK against the PostgreSQL e2e database.
 */
const MCP_TOKEN = 'e2e-mcp-token-qa-v215';

describe('MCP bridge /api/mcp (e2e, PostgreSQL, QA v2.15)', () => {
  let app: INestApplication;
  let server: any;
  let baseUrl: string;
  let adminToken: string;
  const previousToken = process.env.MCP_TOKEN;

  const rpc = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
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

  const login = async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email: process.env.ADMIN_EMAIL || 'e2e-admin@example.com', password: process.env.ADMIN_PASSWORD || 'e2e-password123' })
      .expect(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    process.env.MCP_TOKEN = MCP_TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(PrismaService)).toBeDefined();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);
    server = app.getHttpServer();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start the MCP test HTTP server');
    baseUrl = `http://127.0.0.1:${address.port}`;
    adminToken = await login();
    expect(adminToken).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (previousToken === undefined) delete process.env.MCP_TOKEN;
    else process.env.MCP_TOKEN = previousToken;
  }, 60000);

  it('rejects initialize and tools/list without a token', async () => {
    const missing = await rpc(initRequest).expect(401);
    expect(missing.body.message).toMatch(/token|JWT/i);
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(401);
  });

  it('rejects an invalid MCP token and an invalid JWT', async () => {
    await rpc(initRequest, { 'X-MCP-Token': 'wrong-token' }).expect(401);
    await rpc(initRequest, { Authorization: 'Bearer not-a-jwt' }).expect(401);
  });

  it('accepts X-MCP-Token and a valid admin JWT', async () => {
    const byToken = await rpc(initRequest, { 'X-MCP-Token': MCP_TOKEN }).expect(200);
    expect(parseRpc(byToken).result?.protocolVersion).toBeDefined();

    const byJwt = await rpc({ ...initRequest, id: 3 }, { Authorization: `Bearer ${adminToken}` }).expect(200);
    expect(parseRpc(byJwt).result?.protocolVersion).toBeDefined();
  });

  it('initializes, lists read-only tools and calls them via the SDK over Streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), {
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
      expect(JSON.parse(String((result.content[0] as any).text))).toMatchObject({
        version: APP_VERSION,
      });
    } finally {
      await client.close();
    }
  });

  it('supports initialize -> tools/list -> tools/call as stateless requests', async () => {
    await rpc(initRequest, { 'X-MCP-Token': MCP_TOKEN }).expect(200);
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'X-MCP-Token': MCP_TOKEN }).expect(200);
    const tools = parseRpc(list).result.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.map((tool: any) => tool.name)).toContain('panel_status');

    const call = await rpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'panel_status', arguments: {} } },
      { 'X-MCP-Token': MCP_TOKEN },
    ).expect(200);
    expect(Array.isArray(parseRpc(call).result.content)).toBe(true);
  });

  it('returns an error for an unknown tool name', async () => {
    const response = await rpc(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_user', arguments: {} } },
      { 'X-MCP-Token': MCP_TOKEN },
    ).expect(200);
    const payload = parseRpc(response);
    expect(payload.error || payload.result?.isError === true).toBeTruthy();
  });
});
