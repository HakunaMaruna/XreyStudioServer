import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_VERSION } from '../../version';
import { McpActor, McpPlanService } from './mcp-plan.service';

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const toolError = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Unexpected MCP error' }],
});

@Injectable()
export class McpService {
  constructor(private prisma: PrismaService, private plans: McpPlanService) {}

  createServer(actor: McpActor) {
    const server = new McpServer(
      { name: 'xreystudio', version: APP_VERSION },
      {
        capabilities: { tools: {} },
        instructions:
          'Bridge to the XreyStudio control panel. Most tools are read-only. plan_user_status_change only prepares a plan (no data changes); approve_plan applies a pending plan only with an explicit owner approval token (MCP_APPROVAL_TOKEN). Plans expire after 5 minutes and are single-use.',
      },
    );

    // Обходим глубокую типизацию registerTool с zod-схемами (TS2589):
    // конфигурацию проверяет сам SDK во время выполнения.
    const tool = (name: string, config: any, cb: any) => (server as any).registerTool(name, config, cb);

    tool(
      'panel_status',
      { description: 'Panel version and high-level counts of users, nodes and subscriptions' },
      async () => {
        const [users, nodes, templates, checks] = await Promise.all([
          this.prisma.user.count(),
          this.prisma.node.count(),
          this.prisma.subscriptionTemplate.count(),
          this.prisma.healthCheck.count(),
        ]);
        return text({ version: APP_VERSION, users, nodes, templates, healthChecks: checks });
      },
    );

    tool(
      'list_users',
      {
        description: 'List users with status, traffic and expiry (no passwords or tokens)',
        inputSchema: {
          search: z.string().optional().describe('Filter by email (case-insensitive)'),
          limit: z.number().int().min(1).max(100).optional().describe('Max rows, default 20'),
        },
      },
      async ({ search, limit }) => {
        const rows = await this.prisma.user.findMany({
          where: search ? { email: { contains: search, mode: 'insensitive' } } : {},
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            trafficUsed: true,
            trafficLimit: true,
            deviceLimit: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit ?? 20,
        });
        return text(rows);
      },
    );

    tool(
      'list_nodes',
      { description: 'List nodes with address, status and last known Xray version' },
      async () => {
        const rows = await this.prisma.node.findMany({
          select: { id: true, name: true, address: true, port: true, status: true, xrayVersion: true },
          orderBy: { name: 'asc' },
        });
        return text(rows);
      },
    );

    tool(
      'health_summary',
      {
        description: 'Latest client-eye check per inbound, with success rate and latency',
        inputSchema: { nodeId: z.string().optional().describe('Restrict to one node id') },
      },
      async ({ nodeId }) => {
        const checks = await this.prisma.healthCheck.findMany({
          where: nodeId ? { nodeId } : {},
          orderBy: { checkedAt: 'desc' },
          take: 500,
        });
        const latest = new Map<string, (typeof checks)[number]>();
        for (const check of checks) {
          const key = check.inboundId || `${check.nodeId}:${check.tag}`;
          if (!latest.has(key)) latest.set(key, check);
        }
        const rows = Array.from(latest.values()).map((c) => ({
          nodeId: c.nodeId,
          tag: c.tag,
          protocol: c.protocol,
          target: `${c.host}:${c.port}`,
          success: c.success,
          latencyMs: c.latencyMs,
          checkedAt: c.checkedAt,
        }));
        return text({
          total: rows.length,
          passed: rows.filter((r) => r.success).length,
          avgLatencyMs: rows.length
            ? Math.round(rows.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / rows.length)
            : 0,
          checks: rows,
        });
      },
    );

    tool(
      'list_inbounds',
      {
        description: 'List configured inbounds (protocol, port, node, enabled)',
        inputSchema: { limit: z.number().int().min(1).max(200).optional() },
      },
      async ({ limit }) => {
        const rows = await this.prisma.inbound.findMany({
          select: {
            id: true,
            tag: true,
            protocol: true,
            port: true,
            enabled: true,
            node: { select: { id: true, name: true } },
          },
          orderBy: { tag: 'asc' },
          take: limit ?? 100,
        });
        return text(rows);
      },
    );

    tool(
      'list_subscription_templates',
      { description: 'List subscription templates and how many users use each one' },
      async () => {
        const rows = await this.prisma.subscriptionTemplate.findMany({
          select: {
            id: true,
            name: true,
            title: true,
            accent: true,
            enabled: true,
            _count: { select: { users: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        return text(rows);
      },
    );

    tool(
      'geodata_search',
      {
        description: 'Search the geosite/geoip routing catalog',
        inputSchema: {
          query: z.string().min(1).describe('Code, name or description fragment'),
          type: z.enum(['geosite', 'geoip']).optional(),
        },
      },
      async ({ query, type }) => {
        const q = query.toLowerCase();
        const rows = await this.prisma.geodataCategory.findMany({
          where: {
            ...(type ? { type } : {}),
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 30,
        });
        return text(
          rows.map((r) => ({ type: r.type, code: r.code, name: r.name, rule: `"${r.type}:${r.code}"` })),
        );
      },
    );

    tool(
      'plan_user_status_change',
      {
        description:
          'Create a plan to change a user status (email, status, reason). Does NOT modify data: saves a pending plan for 5 minutes and returns its id, the actor, old/new status and reason as text. Applying requires approve_plan with a separate owner token.',
        inputSchema: {
          email: z.string().email().max(320),
          status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED, UserStatus.EXPIRED]),
          reason: z.string().min(1).max(500),
        },
      },
      async (args: { email: string; status: UserStatus; reason: string }) => {
        try {
          const plan = await this.plans.createUserStatusPlan(actor, args);
          return text({
            message:
              'Plan created. No data was changed. To apply it, call approve_plan with the plan id and the owner approval token.',
            plan,
          });
        } catch (error) {
          return toolError(error);
        }
      },
    );

    tool(
      'approve_plan',
      {
        description:
          'Apply a previously created user status plan using its planId and the explicit owner approvalToken from MCP_APPROVAL_TOKEN. Plans expire after 5 minutes and are single-use. Refuses to change the actor or an ADMIN account.',
        inputSchema: {
          planId: z.string().uuid(),
          approvalToken: z.string().min(1),
        },
      },
      async (args: { planId: string; approvalToken: string }) => {
        try {
          const result = await this.plans.approveUserStatusPlan(actor, args);
          return text({ message: 'Plan approved and applied.', ...result });
        } catch (error) {
          return toolError(error);
        }
      },
    );

    return server;
  }
}
