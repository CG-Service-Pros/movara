# Core API (foundation contract)

Everything phase-2 agents need to build on the foundation. If something here is wrong or
missing, report it instead of working around it. Read `docs/engineering.md` and
`docs/architecture.md` first; this file is the precise "how".

Commands: `pnpm install` · `pnpm dev` (web, auto-migrates and seeds PGlite) · `pnpm -w typecheck` ·
`pnpm -w test` · `pnpm db:generate | db:migrate | db:seed | db:reset` · `pnpm --filter @motion/web build`.

Demo data (seeded when the embedded DB is empty): org slug `vindex` ("Vindex Consulting"), login
`demo@motion.local` / `motion-demo` (Oscar Hidalgo, owner). People Maya Reyes (admin), Theo Kim, Ines Park,
Sam Ortiz. Teams "Leadership team" (is_leadership, all five) and "Delivery team" (Sam, Theo, Ines). Demo API key for
the Ops Agent: `mk_live_demo_ops_agent_0000000000000000` (scopes read, write:todos, write:issues,
write:priorities, write:headlines). Other agents: Notes Agent, Sales Agent. Data: 8 Q4-2026 priorities with
milestones, a 13-week weekly scorecard (anchor week 2026-11-02; "Qualified leads" is missing for the current week),
9 issues, 11 to-dos, 4 headlines, meeting series "Leadership weekly" (standard agenda) with one past meeting
(ratings) and one upcoming, a published vision plan (v4) and chart (v3), one pending approval
(`vision.propose_change`, from the Notes Agent), audit events. `pnpm db:reset` recreates all of it.

## 1. Packages and import paths

| Package | Import | Notes |
|---|---|---|
| `@motion/db` | `import { priorities, createDb, migrate, newId, type Db } from '@motion/db'` | Drizzle schema (`src/schema/*.ts`), types, client, seed. |
| `@motion/core` | `import { execute, defineCommand, ... } from '@motion/core'` | Domain. Area barrels are re-exported from the root. |
| `@motion/core/testing` | `import { createTestDb, seedTestOrg } from '@motion/core/testing'` | Test helpers (section 8). |
| `@motion/terminology` | `import { resolveTerm, previewImport, STANDARD_PACK, TERM_KEYS, type TermKey } from '@motion/terminology'` | |
| `@motion/ui/<component>` | `import { Button } from '@motion/ui/button'` | One file per component; never edit `packages/ui/src/index.ts`. |
| `@motion/config` | tsconfig bases, `@motion/config/vitest` | |

Internal packages are consumed as TypeScript source. Do not add dependencies; all libraries are already installed.

## 2. Ctx, Actor, Scope (`packages/core/src/ctx.ts`)

```ts
type Actor = { type: 'person' | 'agent'; id: string; onBehalfOf?: string }   // = ActorJson in @motion/db
type Scope = 'read' | 'write:todos' | 'write:issues' | 'write:headlines' | 'write:metrics' | 'write:priorities'
           | 'write:meetings' | 'propose:vision' | 'propose:chart' | 'admin'     // SCOPES const array
type Role = 'owner' | 'admin' | 'member' | 'viewer'                              // ROLE_RANK: viewer<member<admin<owner
type Ctx = { db: Db; orgId: string; actor: Actor; scopes: Scope[] | 'all'; role: Role }
```

- People: `scopes: 'all'`, `role` = their role. Agents: `scopes` = the agent's scopes (an API key can only narrow them),
  `role` = the **owner's** role, `actor = { type: 'agent', id: agentId, onBehalfOf: ownerPersonId }`.
- `ctxForPerson(db, orgId, personId): Promise<Ctx>`; `ctxForAgent(db, orgId, agentId, keyScopes?)`;
  `ctxForUser(db, { slug } | { id }, betterAuthUserId): Promise<Ctx | null>` (null = not a member).
- `hasScope(ctx, s)`, `hasRole(ctx, min)`, `requireScope(ctx, s)`, `requireRole(ctx, min)`,
  `requireRead(ctx)` (call at the top of EVERY query: agents need `read`), `actingPersonId(ctx)` (the person, or the agent's owner).
- `scope: 'admin'` is NOT a superset of other scopes; it is its own scope for packs, members, agents.

## 3. Errors (`errors.ts`)

`throw new MotionError(code, message, details?)`; codes `not_found | forbidden | forbidden_scope | conflict | validation | needs_approval`.
`err.status` gives the HTTP status (404/403/403/409/422/202); `err.toJSON()` -> `{ error: { code, message, details } }`; `isMotionError(e)`.
Note: `execute` does **not** throw for approvals; it returns `{ ok: false, needsApproval: true, approvalId }`.

## 4. The runner (`runner.ts`)

```ts
const priorityCreate = defineCommand({
  name: 'priority.create',                 // canonical dotted name; stored in audit + approvals; never rename
  scope: 'write:priorities',               // Scope | Scope[] (any one). Persons always pass the scope check
  minRole: 'member',                       // default 'member' (viewers cannot write)
  input: z.object({ title: z.string().min(1), quarter: z.string().regex(/^\d{4}-Q[1-4]$/) }),   // zod 4
  requiresApprovalForAgents: false,        // boolean | (input) => boolean. 'admin'-scope commands always need approval for agents
  summary: (i) => `Create priority "${i.title}"`,   // one-liner on the approval card
  redactResult: false,                     // true: never store/replay the result (secrets)
  run: async (ctx, input, h) => {          // ctx.db is the TRANSACTION. h = { requestId?, expectedVersion?, approvalId? }
    const [row] = await ctx.db.insert(priorities).values({ ...base(ctx), ...input }).returning()
    return { data: row!, entity: { type: 'priority', id: row!.id }, before: null, after: { title: row!.title } }
  },
})

const r = await execute(ctx, priorityCreate, { title: 'Ship it', quarter: '2026-Q4' }, { requestId, expectedVersion })
// r: { ok: true, data, entity?, auditId, replayed? } | { ok: false, needsApproval: true, approvalId, replayed? }
```

`execute` order: zod parse (-> `validation`) -> scope check (`forbidden_scope`) -> role check (`forbidden`) -> idempotent replay lookup ->
approval gate (agents only) -> **one transaction**: claim `request_log` row, `run`, insert `audit_events` row (actor, on_behalf_of, command,
entity, diff, request_id), store the response in `request_log`. Failures roll back everything (the requestId stays usable).

- **Outcome**: `{ data, entity?, before?, after?, diff? }`. Give `before`/`after` (plain objects, only the interesting fields); the runner stores only the **changed** keys.
- **Idempotency**: same `(org, requestId)` returns the first response with `replayed: true` (JSON round-tripped: Dates become ISO strings). Same requestId with a different command or actor -> `conflict`. `redactResult` commands cannot be replayed (conflict).
- **Optimistic concurrency**: in `run`, load the row and call `assertVersion(row, h.expectedVersion)` (throws `conflict` with `details.current`). Updates must use `touch(table, ctx)` which bumps `version`.
- **Approvals**: agent + (`requiresApprovalForAgents` or `scope` includes `'admin'`) -> an `approvals` row is created (payload = validated input, `request_id` kept) and nothing runs.
  `approvals.decide` approve = re-execute the stored command by name (registry filled by `defineCommand`, so the command module must be imported by `@motion/core`'s index) as the requesting agent with `skipApproval`; scope/role still apply, audit actor stays the agent and the diff gets `approvalId`. If re-execution fails, the approval stays pending.
  Commands an agent may "propose" (e.g. `vision.propose_change`) should therefore be normal commands with `scope: 'propose:vision'` and `requiresApprovalForAgents: true`.
- **Fan-out** (`ownerIds[]`): one command, many inserts, return the array in `data`.
- Do not call another command's `run` directly; call `execute(ctx, otherCmd, ...)` (nested transactions are savepoints; it writes its own audit row).
- Registered names today: `listCommands()`.

Helpers (`helpers.ts`): `newId()` (uuid v7), `base(ctx)` -> `{ id, orgId, createdByActor, updatedByActor }` for inserts,
`scoped(table, ctx, ...extraWhere)` -> `org_id = ctx.orgId AND deleted_at IS NULL AND ...`, `touch(table, ctx)` for updates,
`softDelete(table, ctx)`, `assertVersion(row, expected)`, `changedFields(before, after)`, `found(row, 'Thing')` (not_found),
`encodeCursor(at, id)` / `decodeCursor(cursor)` (keyset pagination, newest first).

## 5. Existing areas (all exported from `@motion/core`)

Queries are `(ctx, input?) => Promise<…>`; commands are used with `execute(ctx, cmd, input, opts)`.

**org** — `createOrg(db, { name, slug, ownerUserId, timezone?, fiscalYearStartMonth?, weekStartDay?, ownerName?, ownerEmail? }) -> { org, ctx }`
(creates org + owner person + "Leadership team"; plain function, writes `org.create` audit). `getOrg(ctx): OrgRow`, `getOrgBySlug(db, slug)`,
`isSlugAvailable(db, slug)`. Commands (all admin role; agents need approval): `orgUpdateGeneral {name?, timezone?}`, `orgUpdateBranding {wordmark?, logoLight?, logoDark?, favicon?, accent? (#rrggbb), loginBackground?, emailSenderName?}` (null clears),
`orgUpdateSettings {settings}`, `orgUpdateModules {modules: Partial<Record<ModuleKey, boolean>>}`, `orgUpdateCalendar {fiscalYearStartMonth?, weekStartDay?, timezone?, quarterCalendar?}`,
`orgSetTerminologyPack {pack: unknown | null, revert?}` (validated with `previewImport`; keeps the previous pack for revert), `orgSetTerminologyOverrides {overrides}` (replaces the whole map).
`MODULE_KEYS`: priorities scorecard issues todos headlines meetings vision chart agents.

**people** — `listPeople(ctx)`, `getPerson(ctx, id)`, `listMembershipsForUser(db, userId)`, `linkUserByEmail(db, {id, email})` (sign-up hook; links pending people).
Commands: `peopleAdd {name, email, role?, timezone?}` (admin; links an existing account by email), `peopleUpdateRole {personId, role}`, `peopleUpdate {personId, name?, timezone?, avatarUrl?, reminderSchedule?}` (self or admin), `peopleRemove {personId}` (soft; last owner protected).

**teams** — `listTeams(ctx): (Team & { members })[]`, `getTeam(ctx, id)`, `listTeamsForPerson(ctx, personId)`.
Commands (admin): `teamsCreate {name, parentTeamId?, leaderId?, isLeadership?, memberIds?}`, `teamsUpdate {teamId, ...}`, `teamsDelete {teamId}`, `teamsAddMember {teamId, personId, role?: 'lead'|'member'}` (upserts), `teamsRemoveMember {teamId, personId}`.

**agents** — `listAgents(ctx, {includeRevoked?})`, `getAgent(ctx, id)`, `listApiKeys(ctx, agentId?)` (no hashes).
Commands (members manage their own agents, admins any): `agentsCreate {name, client?, ownerPersonId?, scopes?}`, `agentsUpdate {agentId, name?, client?, status?: 'active'|'paused'}`, `agentsUpdateScopes {agentId, scopes}`, `agentsRevoke {agentId}`, `agentsRevokeApiKey {keyId}`,
`agentsIssueApiKey {agentId, name?, scopes?, expiresAt?}` / wrapper `issueApiKey(ctx, input, opts)` -> `r.data = { key, keyId, prefix, agentId }` (plaintext `mk_live_<random>` returned **once**, only the sha256 hash is stored, never in audit or request_log).
`authenticateApiKey(db, key): Promise<Ctx>` (throws `forbidden` for unknown/revoked/expired keys; updates last-used).

**approvals** — `listApprovals(ctx, {status?, requestedBy?, limit?, cursor?}) -> { items, nextCursor }`, `getApproval(ctx, id)`,
command `approvalsDecide {approvalId, decision: 'approve'|'decline', note?}` (people only: admins/owners or the requesting agent's owner), wrappers `approveApproval(ctx, id, note?)`, `declineApproval(ctx, id, note?)`.

**audit** — `listAudit(ctx, {actorId?, actorType?, onBehalfOf?, command?, commandPrefix?, entityType?, entityId?, since?, until?, limit?, cursor?}) -> { items, nextCursor }` (newest first; use `entityType`/`entityId` for a per-record activity feed).

**terminology** — `getTerms(ctx): Promise<Terms>`; `createTerms(pack?, overrides?): Terms` (pure; works on plain JSON, e.g. in client components).
`Terms = { t(key, form?: 'singular'|'plural'|'short'), term(key): Term, status(value): string, pack, overrides, attribution? }`. `short` falls back to singular. Always label UI and MCP descriptions through it.

**calendar** — `CalendarSettings = { fiscalYearStartMonth, weekStartDay, quarterCalendar?, timezone? }` (an `OrgRow` satisfies it). Dates are `'YYYY-MM-DD'` strings.
`quarterOf(date, cal) -> { label: '2026-Q4', year, quarter, start, end }`, `quarterRange(label, cal)`, `currentQuarter(cal, now?) -> '2026-Q4'`, `shiftQuarter(label, delta, cal)`, `parseQuarter`, `isQuarterLabel`,
`weekOfQuarter(date, cal) -> { week: 1..13, of: 13, quarter }`, `periodStart(date, 'day'|'week'|'month'|'quarter', cal)`, `shiftPeriod(start, interval, n)`, `recentPeriods(date, interval, count, cal)` (oldest first), `weekStart(date, weekStartDay)`, `addDays(date, n)`, `todayIn(cal, now?)`.
Fiscal-year naming = the year the fiscal year starts.

**Placeholders** (empty `index.ts`, already re-exported from the core root): `priorities scorecard issues todos headlines meetings vision chart search`.

## 6. Database (`packages/db/src/schema/*.ts`)

Common columns on every tenant table: `id uuid` (generated in code with `newId()`), `org_id`, `created_at`, `created_by_actor jsonb`, `updated_at`, `updated_by_actor jsonb`, `version int`, `deleted_at`. Exceptions: `orgs` (no org_id), `audit_events` and `request_log` (own columns), auth tables.
Dates: `date` columns are strings (`mode: 'string'`), events are `timestamptz` (Date).

| File | Tables (and enums) |
|---|---|
| org.ts | `orgs` |
| auth.ts | `user`, `session`, `account`, `verification` (Better Auth; text ids) |
| people.ts | `people` (`person_role`) |
| teams.ts | `teams`, `team_members` (`team_member_role`: lead/member) |
| agents.ts | `agents` (`agent_status`), `api_keys`, `oauth_clients`, `oauth_tokens` |
| vision.ts | `vision_plans` (`vision_scope`), `vision_revisions` (`revision_status`: draft/published/archived; `content jsonb { sections }`) |
| chart.ts | `charts`, `chart_revisions`, `seats` (`linked_priority_id` for open seats) |
| priorities.ts | `priorities` (`priority_level`, `priority_status`), `milestones` |
| scorecard.ts | `scorecards` (`scorecard_interval`), `metrics` (`metric_comparison`, `metric_unit`), `metric_values` (unique metric+period) |
| issues.ts | `issues` (`issue_horizon`, `issue_status`; `source jsonb {type,id}`) |
| todos.ts | `todos` (`todo_status`: open/pending/done) |
| headlines.ts | `headlines` (`headline_kind`) |
| meetings.ts | `meeting_series` (agenda jsonb, rrule, attendee_ids, facilitator_id, scribe_actor), `meetings` (state, ratings, summary, recap_sent_at) |
| approvals.ts | `approvals` (`approval_status`) |
| audit.ts | `audit_events` |
| system.ts | `request_log` (unique org+request_id) |

All table objects and enums are exported from `@motion/db`. JSON shapes (`Branding`, `Modules`, `MeetingState`, `Source`, `VisionContent`, …) are in `packages/db/src/types.ts`.
Quarters are text `YYYY-Qn`. **Schema changes belong to the lead**: report what you need. When the lead changes the schema: edit `src/schema/*`, run `pnpm db:generate` (runs drizzle-kit and re-embeds migrations into `src/migrations.generated.ts`), then `pnpm db:reset`.
`createDb(url?)` -> `postgres://` uses postgres-js, blank / `pglite://dir` uses PGlite (default `<repo>/.data/pglite`), `'memory'` is in-memory. `migrate(db)` applies the embedded migrations. Never touch tables outside core.

## 7. How to write a new area (example: priorities)

Only add files inside `packages/core/src/<area>/` and re-export from that folder's `index.ts`.

```ts
// packages/core/src/priorities/queries.ts
import { asc, eq } from 'drizzle-orm'
import { milestones, priorities } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'      // inside core import from '../ctx', '../helpers', '../runner' (never '../index': cycles)
import { scoped } from '../helpers'
export async function listPriorities(ctx: Ctx, input: { quarter: string; teamId?: string }) {
  requireRead(ctx)
  return ctx.db.select().from(priorities)
    .where(scoped(priorities, ctx, eq(priorities.quarter, input.quarter), input.teamId ? eq(priorities.teamId, input.teamId) : undefined))
    .orderBy(asc(priorities.sort))
}

// packages/core/src/priorities/commands.ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { priorities } from '@motion/db'
import { base, touch, scoped, found, assertVersion } from '../helpers'
import { defineCommand } from '../runner'
export const prioritySetStatus = defineCommand({
  name: 'priority.set_status', scope: 'write:priorities',
  input: z.object({ priorityId: z.uuid(), status: z.enum(['on_track', 'off_track', 'done', 'not_done']) }),
  run: async (ctx, input, h) => {
    const [before] = await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.id, input.priorityId))).limit(1)
    found(before, 'Priority'); assertVersion(before!, h.expectedVersion)
    const [after] = await ctx.db.update(priorities).set({ status: input.status, ...touch(priorities, ctx) })
      .where(scoped(priorities, ctx, eq(priorities.id, input.priorityId))).returning()
    return { data: after!, entity: { type: 'priority', id: after!.id }, before: { status: before!.status }, after: { status: after!.status } }
  },
})

// packages/core/src/priorities/index.ts
export * from './queries'
export * from './commands'
```

Test (`packages/core/src/priorities/priorities.test.ts` or `packages/core/test/priorities.test.ts`; vitest includes both):

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDb, seedTestOrg } from '@motion/core/testing'   // or '../src/testing'
let db: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => { db = await createTestDb() }); afterAll(() => db.$close())
it('sets status and isolates orgs', async () => {
  const a = await seedTestOrg(db), b = await seedTestOrg(db)
  // ... execute(a.ctx, prioritySetStatus, ...); expect(execute(b.ctx, ...)).rejects.toMatchObject({ code: 'not_found' })
})
```
Always test: happy path, `forbidden_scope` for an agent, cross-org `not_found`, and (for gated commands) the approval flow.

## 8. Test helpers (`@motion/core/testing`)

`createTestDb()` (in-memory PGlite + migrations; `await db.$close()` in `afterAll`), `createTestUser(db, name?)`,
`seedTestOrg(db, slug?) -> { org, ctx /* owner */, addPerson(name, role?) -> { ctx, personId }, addAgent(name, scopes?, ownerPersonId?) -> { agentId, ctx, apiKey } }`.
Each package has `vitest.config.ts` re-exporting `@motion/config/vitest` (30s timeouts). Use a fresh org per test instead of a fresh DB.

## 9. Web app (`apps/web`)

Layout: `app/` (routes), `components/shell/` (shared shell), `components/<area>/` (yours), `src/lib/` (server helpers), `src/api/` (REST).
Aliases: `@/lib/*` -> `src/lib/*`, `@/api/*` -> `src/api/*`, `@/*` -> app root (e.g. `@/components/shell/page`).

Server helpers (`src/lib`, all `server-only`, per-request cached):
- `getDb(): Promise<DbHandle>`: shared DB. First call migrates and (PGlite) seeds the demo org.
- `getSession()`: Better Auth `{ user, session } | null`. `getAuth()`: the Better Auth instance. Client: `authClient` (`@/lib/auth-client`).
- `getCtx(orgSlug): Promise<Ctx>`: session -> person in org -> Ctx; redirects to `/sign-in` or `/`.
- `getOrgTerms(orgSlug): Promise<Terms>`; `getOrgContext(orgSlug): { ctx, org, terms, modules }`; `requireModule(orgSlug, key)` (404 if the org switched the module off; returns the same object); `getMyTeams(orgSlug)` (Leadership first).
- Org accent: `org.branding.accent` is applied as `--accent` on the shell wrapper (`data-shell`).

Page skeleton (replace a stub, keep these lines):
```tsx
// app/(app)/[org]/priorities/page.tsx
import { Page } from '@/components/shell/page'
import { listPriorities, currentQuarter } from '@motion/core'
import { requireModule } from '@/lib/ctx'
export default async function PrioritiesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ team?: string; q?: string }> }) {
  const { org: slug } = await params
  const { ctx, org, terms } = await requireModule(slug, 'priorities')   // never hard-code "Priorities": use terms.t('priority', 'plural')
  const rows = await listPriorities(ctx, { quarter: currentQuarter(org) })
  return <Page title={terms.t('priority', 'plural')} meta={...} actions={...}>{/* list/detail or <EmptyState/> */}</Page>
}
```
- `Page`/`PageBody` (`@/components/shell/page`): 44px header + scrolling body inside the inset panel. `StubPage` (`stub-page.tsx`) = the placeholder.
- Team context: sidebar team links are `/{org}/<area>?team=<teamId>`. Pages read `searchParams.team` and default to the person's first team (`(await getMyTeams(slug))[0]`).
- Shell nav lives in `components/shell/nav.ts` (`buildNav`, `buildSettingsNav`, icon keys); labels come from terminology; modules off hide items. Changing nav is a lead change; report it.
- Existing routes (all stubs): `/{org}` home, `todos`, `priorities`, `scorecard`, `issues`, `headlines`, `meetings`, `meetings/[id]`, `vision`, `chart`, `settings/{general,brand,terminology,modules,calendar,members,agents,keys,audit,approvals}`. Settings has its own sub-nav layout.
- Server actions live next to the route in `actions.ts`: `'use server'`, `const ctx = await getCtx(slug)`, `await execute(ctx, cmd, input)`, catch `isMotionError`, `revalidatePath(...)`. For `needsApproval` results show a toast ("Sent for approval").
- Client components: `toast` from `@motion/ui/toaster` (the `<Toaster/>` is mounted by the shell). Command palette items are built in `[org]/layout.tsx`; entity search is added later via the search area.
- Auth: `(auth)/sign-in`, `(auth)/sign-up`, `onboarding` (create org then redirect to `/{slug}`), `proxy.ts` (cookie guard; public: sign-in, sign-up, `/api/auth`, `/api/v1`, `/mcp`). Theme = `motion-theme` cookie (`light|dark`) applied as `data-theme` on `<html>`.
- Next 16 notes: `params` and `searchParams` are Promises; `proxy.ts` replaces middleware; everything under `[org]` is dynamic.

### UI components (`@motion/ui/<name>`; theme in `@motion/ui/theme.css`)
Tokens as Tailwind utilities: `bg-canvas bg-surface bg-raised border-line text-ink text-body text-faint text-icon bg-nav-active text-accent bg-accent bg-accent-soft text-accent-text text-success bg-success-soft text-danger-text text-warning ... rounded-md shadow-panel shadow-pop`; sizes `text-xs/sm/base/lg`. Dark mode swaps CSS variables, so do not use `dark:`.
Components: `button` (`variant` primary|secondary|ghost|danger, `size` sm|md|icon, `asChild`, `loading`), `input`, `textarea`, `label`, `field` (label/hint/error wrapper), `badge`, `status-glyph`, `status-pill` (`status` 'on'|'off'|'done', `label?`), `avatar` (people: circle, initials), `agent-mark` (agents: rounded square + Bot), `facepile` (`items: {name, agent?}[]`), `card`, `dialog`, `sheet`, `dropdown-menu`, `popover`, `select`, `switch`, `tabs`, `segmented`, `tooltip` (+ `Tip`), `checkbox`, `meter` (`value` 0..1, `tone`), `empty-state`, `kbd`, `separator`, `skeleton`, `toaster`, `command`, `page-header`, `list-row` (+ `ListRowGroup`), `cn` (`@motion/ui/cn`).
Radix-based ones are client components. Gotcha: `DropdownMenuItem asChild` needs a single child; prefer `onSelect` + `router.push`. Map status values for display: `on_track -> 'on'`, `off_track -> 'off'`, `done -> 'done'`.

## 10. REST API (`apps/web/src/api`)

`/api/v1/*` (route `app/api/v1/[...path]/route.ts` -> `handleApi`). Auth: `Authorization: Bearer mk_live_…` -> `authenticateApiKey` -> agent `Ctx` (401 otherwise).
Optional headers: `Idempotency-Key` -> `requestId`; `If-Match: <int>` -> `expectedVersion`.
Implemented: `GET /api/v1/org`. Try: `curl localhost:3000/api/v1/org -H 'Authorization: Bearer mk_live_demo_ops_agent_0000000000000000'`.

Add handlers only in `src/api/handlers/<area>.ts` (files exist for every area, each exporting `handlers: HandlerMap = {}`; `handlers/index.ts` already merges them; do not edit it, `router.ts`, or `types.ts`):
```ts
import { execute, listPriorities, prioritySetStatus } from '@motion/core'
import { fromExecute } from '../respond'
import type { HandlerMap } from '../types'
export const handlers: HandlerMap = {
  'GET /priorities': async ({ ctx, query }) => listPriorities(ctx, { quarter: query.get('quarter') ?? '2026-Q4' }),   // plain data -> 200 { data }
  'POST /priorities/:id/status': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, prioritySetStatus, { priorityId: params.id, ...(await json() as object) }, { requestId, expectedVersion })),  // 200 { ok, data, entity, auditId } | 202 { needsApproval, approvalId }
}
```
Keys are `"METHOD /path/:param"`. Errors: `MotionError` -> `{ error: { code, message, details } }` with the status from `MotionError.status`. Use the same command objects as the UI and MCP; never write to the DB from a handler.

## 11. Adding a page, checklist
1. Pick the stub under `app/(app)/[org]/…` and replace its `page.tsx` (stubs exist for every route in the product).
2. `requireModule`/`getOrgContext` first; labels via `terms.t(...)`; render an `EmptyState` when there is no data.
3. Components in `components/<area>/`; server actions in `actions.ts` next to the page calling `execute`.
4. Agent-written things show provenance: `actor.type === 'agent'` -> `AgentMark` + "via MCP · on behalf of <owner>".
5. Run `pnpm -w typecheck`, `pnpm -w test`, and `pnpm --filter @motion/web build`.

## 12. Known limits of the foundation
- No RLS policies yet (isolation is enforced in core: every query uses `scoped`/`org_id`); realtime adapters, email sending, `MOTION_TERMINOLOGY_PACKS` preinstall and OAuth are not implemented (tables exist).
- `approvals.decide` can only re-execute commands registered in `@motion/core`; the seeded pending approval (`vision.propose_change`) becomes approvable once the vision area defines that command.
- Org slug rename, org deletion and invitation emails are not implemented.
