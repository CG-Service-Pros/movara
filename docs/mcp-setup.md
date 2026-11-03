# Connecting agents over MCP

Motion exposes its tool catalog (`docs/mcp-tools.md`) over the Model Context Protocol, so Claude, Cursor, n8n or your own
agent can read the company's rhythm and write to it with the same rules as people (scopes, approvals, audit, idempotency).

Two servers, same code (`apps/mcp/src/server.ts`):

| Where | URL | Use |
|---|---|---|
| Web app route | `https://<host>/mcp` (`apps/web/app/mcp/route.ts`) | Normal deployments: needs a long-running Node server (sessions are in memory) |
| Standalone | `pnpm --filter @motion/mcp start` -> `http://localhost:3333/mcp` | Same database, own process (`DATABASE_URL`, `PORT`) |
| stdio | `pnpm --filter @motion/mcp start:stdio` | Local clients that spawn a process |

## 1. Choose how the client authenticates

| Method | Use for | How |
|---|---|---|
| **OAuth 2.1** (recommended) | Claude Desktop, Claude Code, ChatGPT custom connectors, Cursor: anything that supports remote MCP with sign-in | Add `https://<host>/mcp`; the client opens a Motion sign-in + consent page. No key to copy. |
| **API key** (`mk_live_…`) | n8n, scripts, servers, clients without OAuth, stdio | Settings -> Agents -> create an agent -> issue a key (shown once). |

Both work on the same `/mcp` endpoint (the token prefix tells them apart: `mo_at_…` is OAuth, `mk_live_…` is a key) and both resolve to a
Motion **agent** with scopes, approvals, audit and idempotency. Demo key (seeded demo org only): `mk_live_demo_ops_agent_0000000000000000`.

### How OAuth works here

- Motion is its own authorization server (no Better Auth OAuth plugin is shipped in better-auth 1.7; the code lives in
  `packages/core/src/agents/oauth.ts`). Discovery: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`
  (a request to `/mcp` without credentials answers `401` with a `WWW-Authenticate: Bearer resource_metadata=…` header).
- Clients register themselves (dynamic client registration, `POST /api/auth/oauth2/register`), then run authorization code + PKCE (S256 only)
  at `/oauth/authorize`. You sign in to Motion, **pick the organization** and **tick the scopes** the client gets, and press Allow.
- The first consent creates an **agent** in that org (name = the client's name, owner = you, client = "`<client> · OAuth`"). It shows up in
  Settings -> Agents like any other agent; later consents from the same client reuse it. You can lower its scopes there at any time.
- **Revoking the agent in Settings immediately revokes its OAuth tokens** (access and refresh). Pausing it blocks them until resumed.
- Access tokens last 1 hour; refresh tokens 30 days and rotate on every use. Authorization codes are single use and expire after 10 minutes.
- `APP_URL` (or `BETTER_AUTH_URL`) must be the public URL users and clients reach, since it is published in the metadata. Behind a proxy use `https://`.
  The `/mcp` route is served by the web app; the standalone MCP server (`:3333`) accepts the same tokens but does not host the consent screen.

## 2. Connect

**Claude Desktop** (Settings -> Connectors -> Add custom connector), **ChatGPT** (Settings -> Connectors -> Advanced -> Developer mode -> Create,
MCP server URL; ChatGPT custom connectors need a public `https://` URL, e.g. a tunnel while testing) and **Cursor** (`.cursor/mcp.json`):

1. Enter the URL `https://<host>/mcp` (leave client id / secret empty: the client registers itself) and authentication **OAuth**.
2. A browser window opens at Motion. Sign in, choose the organization, adjust the scopes, **Allow**.
3. The client lists the tools. Start with `org_overview`.

**Claude Code**

```bash
claude mcp add --transport http motion https://<host>/mcp     # then run /mcp inside Claude Code and choose "Authenticate"
```

With an API key instead of OAuth:

```bash
claude mcp add --transport http motion http://localhost:3000/mcp \
  --header "Authorization: Bearer mk_live_…"
```

**Claude Desktop / Cursor with an API key** (`claude_desktop_config.json` / `.cursor/mcp.json`). Remote HTTP:

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

## 4. Limits

- Dynamic client registration is open (any client can register, but gets nothing until a signed-in person consents). Put the app behind your
  usual rate limiting if it is exposed publicly.
- There is no token introspection/revocation endpoint yet: revoke by revoking the agent in Settings -> Agents.
- Sessions live in process memory; for serverless/multi-instance deployments run the standalone server behind sticky routing.
