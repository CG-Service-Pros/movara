# Engineering conventions (read before writing code)

Movara is an open-source, agent-first operating system for running a company on a
quarterly rhythm. Product docs: `docs/architecture.md` (data model, rules),
`docs/mcp-tools.md` (MCP catalog), `docs/terminology-packs.md`, `docs/design-plan.md`
(visual system), `docs/build-plan.md` (milestones). Visual reference: the mockups in
`design/stageshow/examples/movara-*` (React + CSS; tokens in `design/stageshow/examples/_movara/movara.css`;
PNG stills in `design/stageshow/shots/` may be missing; read the TSX/CSS instead).

## Stack (fixed, do not swap)

| Concern | Choice |
|---|---|
| Runtime | Node 22, pnpm 10 workspaces, Turborepo |
| Language | TypeScript 5 `strict`, ESM everywhere |
| Web | Next.js 16 App Router, React 19, server components + server actions |
| Styling | Tailwind CSS v4 (CSS-first `@theme`), tokens from `movara.css`; lucide-react icons (15px, stroke 1.7) |
| DB | PostgreSQL via Drizzle ORM. `DATABASE_URL=postgres://…` uses `postgres` (postgres-js). Unset or `pglite://<dir>` uses **PGlite** (embedded, for dev/tests/demo) |
| Auth | Better Auth (email + password, sessions) with its Drizzle adapter, same database |
| Validation | Zod 4 |
| MCP | `@modelcontextprotocol/sdk`, streamable HTTP + stdio |
| Tests | Vitest (core runs against in-memory PGlite), Playwright for one smoke flow |

## Repo layout

```
apps/web            Next.js app (UI, server actions, REST /api/v1, auth routes)
apps/mcp            MCP server (node), also mountable from web at /mcp
packages/config     tsconfig bases, shared vitest config
packages/db         drizzle schema (src/schema/*.ts, one file per area), client factory, migrations, seed
packages/core       domain: commands/queries per area (src/<area>/*.ts), ctx, runner, audit, approvals, scopes, quarter math
packages/terminology  term keys, pack schema, resolver, Standard pack (exists)
packages/ui         design-system primitives (Tailwind + Radix where needed)
packs/eos           community EOS pack (data only)
```

Package names: `@movara/web`, `@movara/mcp`, `@movara/db`, `@movara/core`,
`@movara/terminology`, `@movara/ui`, `@movara/config`. Internal packages are consumed as
TypeScript source (`"exports": { ".": "./src/index.ts", "./*": "./src/*.ts" }`). Next uses
`transpilePackages`.

## Core rules

- **Everything goes through `@movara/core`.** UI server actions, REST and MCP call core
  functions. No direct DB writes outside core (reads may use core queries too).
- **Context:** `type Ctx = { db, orgId, actor: Actor, scopes: Scope[] | 'all' }`, where
  `Actor = { type: 'person' | 'agent', id: string, onBehalfOf?: string }`. People have
  `scopes: 'all'` limited by role.
- **Commands** are defined with `defineCommand({ name, scope, input: zodSchema, requiresApprovalForAgents?, run })`
  and executed with `execute(ctx, command, input, { requestId?, expectedVersion? })`. The
  runner validates, checks the scope and role, handles idempotency (`request_log` table),
  creates an approval instead of running when an agent hits `requiresApprovalForAgents`,
  runs inside a transaction, and writes `audit_events` (actor, command, entity, diff).
- **Queries** are plain async functions `(ctx, input) => result`, always filtered by `ctx.orgId`.
- **Org isolation** is enforced in core: every query and write includes `org_id = ctx.orgId`.
  Tests must cover cross-org access returning not_found.
- **Errors:** throw `MovaraError(code, message)` with code in `not_found | forbidden | forbidden_scope | conflict | validation | needs_approval`.
- **IDs:** uuid v7 (`uuidv7` from the `uuid` package) generated in core.
- **Dates:** store `date` for due dates and periods, `timestamptz` for events. Quarter
  helpers live in `packages/core/src/calendar.ts` (respect org fiscal start and week start).
- **Terminology:** UI labels for concepts use `t(key, form)` from the org's resolved
  terminology (never hard-code "Priority" in the UI).

## Web conventions

- Routes: `apps/web/app/(app)/[org]/...`. Each area owns its folder:
  `home`, `priorities`, `scorecard`, `issues`, `todos`, `headlines`, `meetings`, `vision`,
  `chart`, `settings`, plus `(auth)` and `onboarding`.
- Area-specific components go in `apps/web/components/<area>/`. Shared app components go in
  `apps/web/components/shell/`. Design-system primitives go in `packages/ui/src/` (one file
  per component). **Do not edit `packages/ui/src/index.ts`.** Import primitives by path:
  `@movara/ui/button`.
- Server actions live next to their route (`actions.ts`), call core, then `revalidatePath`.
- Every page renders an empty state. People are shown as circle avatars; **agents are
  rounded squares** with the Bot glyph. Anything written by an agent shows provenance.
- Light and dark themes via the `data-theme` attribute on `<html>`. Org accent color via CSS variable
  `--accent` from org branding.

## Working in parallel (for subagents)

- Stay inside the files and directories your brief assigns. If you need a change in a
  shared file (db schema, core runner, ui index, shell nav), **report it in your final
  message instead of making it**, unless your brief says you own that file.
- **Do not add dependencies** unless your brief lists them. Never run `pnpm add` at the repo
  root concurrently with other agents. Ask in your report instead.
- Do not commit, push, or rewrite git history; the lead does all commits.
- Before finishing: `pnpm -w typecheck` and `pnpm -w test` must pass for your packages.
  Say exactly what you ran and the result.
