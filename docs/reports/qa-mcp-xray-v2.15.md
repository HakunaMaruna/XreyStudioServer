# QA: MCP bridge and Xray config (v2.15+)

Date: 2026-11-24. Owner: second agent, issue #125. Zone: `backend/test`, `docs/reports`.
Product code, versions, tags and releases are untouched. Branch `qa/mcp-xray-v215` is based on
`main` at `554a430`, v2.15.5. CI: all four jobs green on the final commit `3e8b509`:
https://github.com/HakunaMaruna/XreyStudioServer/actions/runs/45344646540

## Scope

1. End-to-end tests for the read-only MCP bridge at `/api/mcp` — `initialize -> tools/list ->
   tools/call` over Streamable HTTP, `X-MCP-Token` (`MCP_TOKEN`), admin JWT, 401 cases,
   read-only tool set.
2. Tests for generated Xray config — per-user stats, `api-in` when `XRAY_STATS_ENABLED=true`,
   VLESS Reality and VMess inbounds.
3. Live smoke against `https://msc.h2onetwork.pro`.

## Tests added

### `backend/test/mcp.e2e-pg-spec.ts` (6 tests)

Uses the real Nest `AppModule` against the PostgreSQL e2e database and the real MCP SDK client.
No product code is mocked. An ephemeral HTTP port is bound because the SDK's
`StreamableHTTPClientTransport` requires a live HTTP server.

- `POST /api/mcp` without `X-MCP-Token` or JWT returns 401 with the message
  `MCP token or admin JWT required`.
- An invalid token and an invalid bearer token both return 401.
- A valid `MCP_TOKEN` and a real admin JWT both complete `initialize`.
- The SDK client completes `initialize -> tools/list -> tools/call` over Streamable HTTP;
  `tools/list` contains `panel_status`, `list_users`, `list_nodes`, `health_summary`,
  `list_inbounds`, `list_subscription_templates` and `geodata_search`, and no tool name starts
  with a mutating verb (`create`, `update`, `delete`, `remove`, `set`, `add`, `patch`, `revoke`,
  `restart`, `stop`, `start`). `panel_status` returns a text payload with version `2.15.5`.
- Raw JSON-RPC requests complete the same sequence successfully.
- An unknown tool name (`delete_user`) produces a JSON-RPC error or `isError`.

### `backend/test/xray-stats-and-protocols.e2e-pg-spec.ts` (6 tests)

Unit-level tests of the real `ConfigGeneratorService`; only the Prisma delegate is mocked, so no
fixtures are required. This file lives in `backend/test/` to stay inside the issue's zone.

- `policy.levels['0']` always has `statsUserUplink: true` and `statsUserDownlink: true`.
  `api-in` and the `api` service are present only when `XRAY_STATS_ENABLED=true`, with the
  expected routing rule and loopback listener.
- `XRAY_API_PORT` changes the `api-in` port and its settings.
- VLESS Reality inbound carries `privateKey`, `serverNames`, `shortIds`, `flow` and a client with
  `flow` read from `inbound.settings`.
- VMess inbound carries clients only for active users.
- A per-client traffic limit excludes an exhausted client.
- Config-profile rules, DNS servers and outbounds are applied.

## Findings

- **Issue wording mismatch (no code change).** Issue #125 asks to check
  `policy.levels['0'].stats === true`. The shipped generator (`f2dcfac`, v2.15.5) sets the
  granular fields `statsUserUplink` and `statsUserDownlink` instead of a `stats` field. The tests
  assert the fields that actually exist; no product change was made because versions/tags were
  out of scope.
- **MCP transport is stateless.** `GET` and `DELETE /api/mcp` are handled by the SDK transport
  rather than returning 405, and no `Mcp-Session-Id` is issued. Tests were written against this
  actual behaviour.
- **Auth is enforced consistently.** Both a missing token and an invalid token are rejected before
  any MCP handling.

## Live smoke (`https://msc.h2onetwork.pro`, 2026-11-24)

| Endpoint | Result |
| --- | --- |
| `GET /api/health` | `200`, `{status:"ok",service:"xss-backend",db:"ok"}` |
| `GET /api/squads` | `401` without JWT |
| `GET /api/config-profiles` | `401` without JWT |
| `GET /api/geodata` | `401` without JWT |
| `GET /api/mcp` | `401` `MCP token or admin JWT required` |
| `POST /api/mcp` without token | `401` `MCP token or admin JWT required` |
| `GET /api/mcp` with invalid `X-MCP-Token` | `401` `MCP token or admin JWT required` |

НЕ ПРОВЕРЕНО: авторизованные live-запросы к `/api/squads`, `/api/config-profiles`,
`/api/geodata`, полный MCP `initialize -> tools/list -> tools/call` на проде и подписка
тестового пользователя с двумя ссылками — для них нужны рабочий административный JWT или
`MCP_TOKEN` и тестовая учётная запись на prod; они не были предоставлены. Локально и в CI эти
сценарии покрыты e2e-тестами с PostgreSQL.

## Verification

```bash
cd backend && npm ci && npm run typecheck && npm run test:e2e:pg
```

GitHub Actions on `qa/mcp-xray-v215`: `backend`, `frontend`, `docker`, `e2e-postgres` — all
success. Earlier failures during development were caused by incorrect test assumptions (fixture
shape, stateless transport, missing HTTP listener) and were fixed in the test files only.
