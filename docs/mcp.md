# MCP bridge (read-only by default, opt-in write-plan)

The panel exposes a small [Model Context Protocol](https://modelcontextprotocol.io/) server over
Streamable HTTP at `POST /api/mcp`. It lets an AI agent inspect the state of the panel without
giving it write access — every tool only reads Prisma data. Nothing can be changed through MCP.

Idea borrowed from mistgate (AGPL-3.0); implemented independently.

## Authentication

One of:

- `X-MCP-Token: <MCP_TOKEN>` (recommended for long-lived agents), or
- `Authorization: Bearer <MCP_TOKEN>`, or
- `Authorization: Bearer <admin JWT>` (15-minute access token from `POST /api/auth/login`).

If `MCP_TOKEN` is not set, JWT auth is still available. The token is compared in constant time;
there is no way to enumerate it through the endpoint.

Add to `.env`:

```env
MCP_TOKEN=replace-with-a-long-random-token
```

The value is passed to the backend through the existing `env_file: .env` entry in
`docker-compose.yml`.

## Client configuration

Example for an MCP client that supports Streamable HTTP (URL + custom header):

```json
{
  "mcpServers": {
    "xreystudio": {
      "type": "http",
      "url": "https://msc.h2onetwork.pro/api/mcp",
      "headers": { "X-MCP-Token": "<MCP_TOKEN>" }
    }
  }
}
```

Protocol handshake is the standard MCP one:

```bash
curl -sS https://msc.h2onetwork.pro/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'X-MCP-Token: <MCP_TOKEN>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}'
```

Then call `tools/list` / `tools/call` on the same endpoint. The transport is stateless: each
request is self-contained and no session id is issued.

## Tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `panel_status` | — | version and counts of users, nodes, templates, checks |
| `list_users` | `search?`, `limit?` | users with status, traffic, expiry and device limit (no tokens/passwords) |
| `list_nodes` | — | node id, name, address, status, Xray version |
| `health_summary` | `nodeId?` | latest client-eye check per inbound, pass rate and average latency |
| `list_inbounds` | `limit?` | inbound tag, protocol, port, node, enabled |
| `list_subscription_templates` | — | templates and assigned user counts |
| `geodata_search` | `query`, `type?` | matching geosite/geoip categories with ready-to-copy rule strings |

All results are JSON wrapped in an MCP text content block.


## Owner-approved write plans (opt-in)

Set `MCP_APPROVAL_TOKEN` (at least 16 characters, owner-only secret) to enable two extra tools.
Without it every request fails with a clear "not configured" error — no data is changed.

- `plan_user_status_change({ email, status, reason })` — creates a **pending plan** and returns
  its id, actor (from the JWT, never from arguments), old/new status and reason as text. It only
  reads the target to report the current status; no writes happen.
- `approve_plan({ planId, approvalToken })` — applies a pending plan only when `approvalToken`
  matches `MCP_APPROVAL_TOKEN` (constant-time comparison). Plans expire after 5 minutes, are
  single-use, cannot target the actor or an ADMIN account and are written to `AuditLog` by the
  same service. A wrong token leaves the plan pending.

Plans are kept in memory: a panel restart discards them, so an operator must create a fresh plan.
