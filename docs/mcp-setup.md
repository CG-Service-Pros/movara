# Connecting agents over MCP

Motion exposes its tool catalog (`docs/mcp-tools.md`) over the Model Context Protocol, so Claude, Cursor, n8n or your own
agent can read the company's rhythm and write to it with the same rules as people (scopes, approvals, audit, idempotency).

Two servers, same code (`apps/mcp/src/server.ts`):

| Where | URL | Use |
|---|---|---|
| Web app route | `https://<host>/mcp` (`apps/web/app/mcp/route.ts`) | Normal deployments: needs a long-running Node server (sessions are in memory) |
| Standalone | `pnpm --filter @motion/mcp start` -> `http://localhost:3333/mcp` | Same database, own process (`DATABASE_URL`, `PORT`) |
| stdio | `pnpm --filter @motion/mcp start:stdio` | Local clients that spawn a process |

## 1. Get an API key

Settings -> Agents -> create an agent (owner + scopes) -> issue a key (`mk_live_…`, shown once). The key can only narrow
the agent's scopes. Demo key (seeded demo org only): `mk_live_demo_ops_agent_0000000000000000`.

## 2. Connect

**Claude Code**

```bash
claude mcp add --transport http motion http://localhost:3000/mcp \
  --header "Authorization: Bearer mk_live_…"
```

**Claude Desktop / Cursor** (`claude_desktop_config.json` / `.cursor/mcp.json`). Either remote HTTP:

```json
{ "mcpServers": { "motion": { "url": "https://motion.example.com/mcp", "headers": { "Authorization": "Bearer mk_live_…" } } } }
```

or stdio (clients without HTTP header support):

```json
{ "mcpServers": { "motion": {
  "command": "pnpm", "args": ["--filter", "@motion/mcp", "start:stdio"], "cwd": "/path/to/motion",
  "env": { "MOTION_API_KEY": "mk_live_…", "DATABASE_URL": "postgres://…" }
} } }
```

stdio needs `MOTION_API_KEY` and `DATABASE_URL` (blank / `pglite://dir` = embedded dev DB; do not share a PGlite dir between processes).

**n8n / any HTTP client** (JSON-RPC, streamable HTTP). First `initialize`, keep the `Mcp-Session-Id` response header, then call tools:

```bash
curl -si localhost:3333/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer mk_live_…' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"n8n","version":"1"}}}'

curl -s localhost:3333/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer mk_live_…' -H 'Mcp-Session-Id: <id>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"metric_record_values","arguments":{"requestId":"hubspot-leads-2026-11-02","values":[{"metricTitle":"Qualified leads","periodStart":"2026-11-02","value":14}]}}}'
```

In n8n use the MCP Client Tool node (endpoint URL, header auth `Authorization: Bearer …`), or an HTTP Request node with the calls above.

## 3. Behaviour agents can rely on

- **Scopes.** The tool list only contains tools the agent may call (`read`, `write:todos`, `write:issues`, `write:headlines`,
  `write:metrics`, `write:priorities`, `write:meetings`, `propose:vision`, `propose:chart`, `admin`). `admin` is its own scope (packs,
  members, agents) and always needs approval. A read-only agent sees only `*_get`/`*_list`/`search`/…
- **Terminology.** Tool names are canonical (`priority_set_status`); descriptions, prompts and returned labels use the org's words
  ("Set the status of a Rock (90-day priority)…"), rendered when the session starts. Reconnect after changing the pack.
- **Writes** accept `requestId` (idempotent replay, `replayed: true`) and `expectedVersion` (fails with `conflict`).
  They return `{ ok, entity, auditId }` or `{ ok: false, needsApproval: true, approvalId }`; poll `approval_status`.
- **Errors** are MCP tool errors (`isError`) with `{ "error": { "code", "message" } }`; code is `not_found | forbidden | forbidden_scope | conflict | validation | needs_approval`.
- **Lists** return `{ items, nextCursor, total }` (pass `cursor`, `limit`); `*_get` returns full detail.
- **Resources:** `motion://org/overview`, `motion://quarter/current`, `motion://team/{id}/scorecard`, `motion://meeting/{id}/live`.
  Subscribe to get `notifications/resources/updated` (live meetings are polled every 2 s on `rev`; the others every 15 s).
- **Prompts:** `weekly-meeting-prep`, `issue-triage`, `quarterly-planning`, `write-a-good-priority`, `metric-from-hubspot`.
- Every request updates the agent's `last_seen`.

## 4. Not done yet

- **OAuth 2.1 (PKCE).** Auth today is Bearer API keys only. Next step: Better Auth's `mcp` plugin in `apps/web/src/lib/auth.ts`
  (needs the plugin's `oauthApplication`, `oauthAccessToken`, `oauthConsent` tables in `packages/db`, or mapping onto the existing
  `oauth_clients`/`oauth_tokens`), `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` routes, a consent
  page, then resolving the token to an agent ctx (`ctxForAgent`) in `http-handler.ts`.
- Sessions live in process memory; for serverless/multi-instance deployments run the standalone server behind sticky routing.
