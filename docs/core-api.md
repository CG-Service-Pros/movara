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
milestones, a 13-week weekly scorecard (anchor week 2026-11-02; "Qualified leads", owned by the demo user, is missing for the current week),
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

**people** — `listPeople(ctx)`, `getPerson(ctx, id)`, `listMembershipsForUser(db, userId)`, `getInvite(db, token)` (public details of a pending invite or null), `acceptInvite(db, token, userId)` (the ONLY way an account is linked to an invited person; single use, 14-day expiry; throws `not_found` for bad/used/expired tokens, `conflict` if the account is already a member).
Commands: `peopleAdd {name, email, role?, timezone?}` (admin; creates a pending person and returns a one-time `inviteToken`, never links an account by email; result is redacted from `request_log`), `peopleCreateInvite {personId}` (admin; reissues `{inviteToken, expiresAt}` for someone who has not joined), `peopleUpdateRole {personId, role}`, `peopleUpdate {personId, name?, timezone?, avatarUrl?, reminderSchedule?}` (self or admin), `peopleRemove {personId}` (soft; last owner protected).

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
| agents.ts | `agents` (`agent_status`), `api_keys`, `oauth_clients`, `oauth_codes`, `oauth_tokens` |
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
- No RLS policies yet (isolation is enforced in core: every query uses `scoped`/`org_id`); realtime adapters, email sending and `MOTION_TERMINOLOGY_PACKS` preinstall are not implemented. MCP OAuth lives in `agents/oauth.ts` (`registerOAuthClient`, `approveAuthorization`, `exchangeAuthorizationCode`, `refreshOAuthToken`, `authenticateOAuthToken`); `agents.revoke` revokes the tokens.
- `approvals.decide` can only re-execute commands registered in `@motion/core`; the seeded pending approval (`vision.propose_change`) becomes approvable once the vision area defines that command.
- Org slug rename, org deletion are not implemented. Invitation emails are sent only when SMTP is configured (the invite link is always shown in Members settings).

## Areas: priorities, scorecard, vision, chart

Queries need `read` (agents). Commands: name / scope / role. Persons always pass scope checks. REST routes are in `apps/web/src/api/handlers/{priorities,scorecard,vision,chart}.ts`.

### priorities (`write:priorities`, role member)
- `listPriorities(ctx, {quarter?, teamId?, ownerId?, status?, level?}) -> (Priority & {milestonesTotal, milestonesDone})[]`: default quarter = org current quarter; ordered by `sort`.
- `getPriority(ctx, id) -> Priority & {milestones, parent, children}`: one priority with ordered milestones and cascade links.
- `prioritiesSummary(ctx, {quarter?, teamId?, asOf?}) -> {quarter, week: {week, of:13} | null, total, byStatus, milestonesTotal, milestonesDone}`: counts by status and week N of 13 (week is null for non-current quarters).
- `priorityCreate` (`priority.create`) `{title, description?, ownerId? (default: acting person), teamId?, quarter? (default current), dueDate?, level?, status?, parentPriorityId?, milestones?[{title,dueDate?}]}`: create with optional milestones; parent link is cycle-checked.
- `priorityUpdate` (`priority.update`) `{priorityId, title?, description?, ownerId?, teamId?, quarter?, dueDate?, level?, parentPriorityId?}`.
- `prioritySetStatus` (`priority.set_status`) `{priorityId, status: on_track|off_track|done|not_done|dropped}`.
- `priorityDelete` (`priority.delete`) `{priorityId}`: soft delete incl. milestones; **agents need approval**.
- `priorityReorder` (`priority.reorder`) `{quarter, priorityIds[]}`: set `sort` in the given order.
- `priorityCascade` (`priority.cascade`) `{priorityId, teamId, ownerId?, title?}`: child team-level priority with `parentPriorityId`.
- `milestoneAdd` `{priorityId, title, dueDate?}`, `milestoneUpdate` `{milestoneId, title?, dueDate?}`, `milestoneToggle` `{milestoneId, done?}` (flips when `done` omitted), `milestoneReorder` `{priorityId, milestoneIds[]}` (must list all), `milestoneDelete` `{milestoneId}` (names `milestone.add|update|toggle|reorder|delete`).

### scorecard (`write:metrics`; scorecard settings need role admin)
- `listScorecards(ctx) -> (Scorecard & {teamName, metricCount})[]`; `getMetric(ctx, id)`.
- `getScorecard(ctx, {scorecardId | teamId, periods?, asOf?}) -> {scorecard, periods[] (oldest first, last = current), metrics: (Metric & {cells: {periodStart, value, note, status: on|off|missing}[], total (additive only), average, latestStatus})[], latestPeriod, onTrackCount, offTrackCount, missingCount}`.
- `offTrackMetrics(ctx, {asOf?}) -> {scorecardId, teamId, teamName, metric, period, value, status}[]`: org-wide, off track in the current period (missing values are not listed).
- `metricStatus({comparison, goal, goalUpper}, value) -> 'on'|'off'|'missing'`: pure; gte/lte/gt/lt/eq, `between` inclusive; no value = missing; no goal = on.
- `scorecardCreate` (`scorecard.create`) `{teamId, interval?, weekStartDay? (0=Sun, default org), periodsShown?}`: one per team (conflict otherwise). `scorecardUpdateSettings` (`scorecard.update_settings`) `{scorecardId, interval?, weekStartDay?, periodsShown?}`.
- `metricCreate` (`metric.create`) `{scorecardId, title, goal, comparison?, goalUpper? (required for between), ownerIds?, unit?, scale?, decimals?, additive?, source?}`; `metricUpdate` (`metric.update`) `{metricId, ...}` partial; `metricReorder` `{scorecardId, metricIds[]}`; `metricArchive` (`metric.archive`) `{metricId}` soft delete, **agents need approval**.
- `metricRecordValues` (`metric.record_values`) `{scorecardId?, teamId?, values: [{metricId | metricTitle (exact, needs scorecardId/teamId), periodStart, value|null, note?}]}`: atomic batch upsert by (metric, period); any date is normalized to the scorecard interval start (using the scorecard's `weekStartDay`); duplicates in a batch: last wins; omitted note keeps the old one. Returns `{count, items}`.

### vision (`propose:vision`; sections live in `content.sections`)
- Types: `VisionSectionsSchema` (zod) with `coreValues[]`, `coreFocus{purpose,niche}`, `longRangeTarget{text,date}`, `marketing{targetMarket,uniques[],provenProcess,guarantee}`, `threeYear|oneYear{date,revenue,profit,measurables[{name,value}],goals[{text, provenance?}]}`, `quarterly{quarter,revenue,profit,priorityIds[]}`, `longTermIssueIds[]`. `sectionsOf(revision)` returns the typed sections. `Provenance = {proposedBy, approvalId?, approvedBy?, source?, at?}`.
- `getVision(ctx, {teamId?}) -> {plan, published, draft}` (company plan unless `teamId`; `approvedBy` on goals is filled from the approval); `getVisionRevision(ctx, id)`; `listVisionRevisions(ctx, {teamId?})` newest first.
- `visionCreateDraft` (`vision.create_draft`) `{teamId?}`: draft copied from the published revision (returns the existing draft with `created:false`). `visionUpdateDraft` (`vision.update_draft`) `{revisionId, sections}`: each given section replaces the stored one. `visionDiscardDraft` `{revisionId}`.
- `visionPublish` (`vision.publish`) `{revisionId}`: role admin; **agents need approval**; archives the previous published revision.
- `visionProposeChange` (`vision.propose_change`) `{section, op: add_goal|add_core_value|add_long_term_issue|set, text?, issueId?, value?, source?, teamId?, publish?}`: `section` accepts canonical keys or legacy keys (`one_year_plan`, ...; the seeded approval uses these). **Agents get an approval**; on approval the change is applied to a new copy of the published content and published (goals get provenance). Called by a person it goes into the draft; `publish: true` (admin) publishes.

### chart (`propose:chart`)
- `getChart(ctx) -> {chart, published, draft}` where each is `{revision, seats: SeatNode[] (tree), seatCount}`; `SeatNode = Seat & {people[{id,name}], assistingAgents[{id,name}], children[]}`. `getChartRevision(ctx, id)`, `listChartRevisions(ctx)`, `seatTree(ctx, revisionId)`. `STANDARD_SEATS` = names of the five-seat template (Leader + Sales & marketing, Operations, Finance & admin, People & culture; the Standard pack has no seat names).
- `chartCreateDraft` (`chart.create_draft`) `{from?: published|blank|template}`; `chartDiscardDraft` `{revisionId}`.
- `chartPublish` (`chart.publish`) `{revisionId}`: role admin, **agents need approval**; needs exactly one top seat.
- Seat edits (drafts only; published revisions are immutable): `chartAddSeat` `{revisionId, title, parentSeatId?, responsibilities?, personIds?, assistingAgentIds?, teamId?, linkedPriorityId?}`, `chartUpdateSeat` `{seatId, title?, responsibilities?, teamId?, linkedPriorityId?}`, `chartMoveSeat` `{seatId, parentSeatId|null, sort?}` (cycle-safe), `chartReorderSeats` `{revisionId, parentSeatId|null, seatIds[]}`, `chartDeleteSeat` `{seatId}` (children move up), `chartAssignPeople` `{seatId, personIds[]}`, `chartSetAssistingAgents` `{seatId, agentIds[]}`.
- `chartProposeChange` (`chart.propose_change`) `{ops: [{op: add_seat|update_seat|move_seat|delete_seat|assign_people|set_assisting_agents, seat: id-or-exact-title, ...}], reason?, publish?}`: **agents get an approval**; on approval applied to a fresh copy of the published chart and published; by a person it goes to the draft (`publish: true` + admin publishes). Seats may be referenced by published id, draft id or exact title.

## Areas: issues, todos, headlines, meetings, search

All commands are used with `execute(ctx, cmd, input, { requestId, expectedVersion })`; queries are `(ctx, input?) => Promise<…>` and need `read` for agents. Update/state commands honour `expectedVersion`. Every command that fans out takes `ownerIds[]` (default: the acting person) and returns an **array** in `data`. While a team's meeting is live, any change to that team's issues, to-dos or headlines also bumps the meeting's `rev`.

### Issues (`scope write:issues`)
- `issueCreate {title, description?, ownerIds?, teamId?, horizon?: 'short'|'long', source?: {type,id}}` -> `IssueRow[]` (one per owner, ranked at the bottom of the destination list).
- `issueUpdate {issueId, title?, description?, ownerId?}`; `issueSetRank {issueId, rank}` (1 = top; re-numbers the siblings); `issueSolve {issueId}`; `issueReopen {issueId}` (back to the bottom of the list); `issueDrop {issueId}`; `issueMove {issueId, teamId?, horizon?}` (another team and/or long-term).
- `listIssues(ctx, {teamId?, horizon?, status?: 'open'|'solved'|'dropped'|'all' (default open), ownerId?, limit?})` (open = by rank), `getIssue(ctx, id)`.

### To-dos (`scope write:todos`)
- `todoCreate {title, description?, ownerIds?, teamId? (null = personal), dueDate? (default today+7 in org tz), source?}` -> `TodoRow[]`.
- `todoUpdate {todoId, title?, description?, ownerId?, teamId?, dueDate?}`; `todoDelete {todoId}` (soft).
- `todoComplete {todoId}`: status `pending` if the to-do's team has a LIVE meeting, else `done` (+`doneAt`); `todoUncomplete {todoId}` -> `open`.
- `listTodos(ctx, {ownerId?, teamId?, personal?, status?: one|array, overdue?, limit?})` (due date ascending), `getTodo(ctx, id)`.

### Headlines (`scope write:headlines`)
- `headlinePost {text, kind?: 'customer'|'employee'|'general', ownerIds?, teamId}` -> `HeadlineRow[]`; `headlineUpdate {headlineId, text?, kind?, ownerId?}`; `headlineMarkReviewed {headlineId, reviewed?=true}`; `headlineDelete {headlineId}`.
- `headlineCascade {headlineId, teamIds[]}` -> copies (`cascadedFromId` = original; teams that already hold a copy are skipped).
- `listHeadlines(ctx, {teamId?, ownerId?, reviewed?, limit?})`, `getHeadline(ctx, id)`.

### Meetings (`scope write:meetings`)
Series / scheduling (admin role): `meetingSeriesCreate {teamId, name, templateKey?='weekly', agenda?: [{term,minutes}], rrule? ('FREQ=WEEKLY;BYDAY=MO,WE' or null = ad-hoc), startTime? 'HH:MM' (org tz), durationMinutes?, attendeeIds? (default team members), facilitatorId?, scribeActor?, firstScheduledAt?}` -> `{series, firstMeeting|null}`; templates come from the org's pack `meetingTemplates`, then Standard (`listMeetingTemplates(ctx)`). `meetingSeriesUpdate {seriesId, name?, agenda?, rrule?, startTime?, durationMinutes?, attendeeIds?, facilitatorId?, scribeActor?}`. `meetingScheduleNext {seriesId, scheduledAt?}` -> `{meeting, created}` (reuses an already-upcoming occurrence; ad-hoc series need `scheduledAt`).
Reads: `listMeetingSeries(ctx, {teamId?})`, `getMeetingSeries(ctx, id)` (+`upcoming`), `listMeetings(ctx, {seriesId?, teamId?, status?: 'upcoming'|'live'|'past', limit?})`, `getMeeting(ctx, id)` (series, team, attendees, agenda), `listMeetingHistory(ctx, {seriesId?, teamId?, limit?})` -> `MeetingStats & {meetingId, seriesName, endedAt, hasSummary, summary…}[]` (stats: `durationMinutes, ratingAvg, ratingCount, issuesSolved, issuesTotal, todosDone, todosTotal, attendeeCount, invitedCount, newTodoCount`), `prepareMeeting(ctx, {meetingId?|seriesId?|teamId?})` -> `{offTrackMetrics, offTrackPriorities, openIssues (ranked), overdueTodos, headlinesToReview}` (metric status computed from the latest recorded value; scorecard tables are read directly).

Live commands (all take `meetingId`; need the meeting to be live except start):
- `meetingStart {meetingId | seriesId}` (seriesId: picks the nearest scheduled occurrence or creates one; one live meeting per team), `meetingJoin` / `meetingLeave` (presence of people and agents), `meetingPause` / `meetingResume`, `meetingNextSection`, `meetingSetSection {index}` (per-section timers accumulate; pause/resume safe).
- `meetingDropToIssue {from: {type: 'metric'|'priority'|'headline'|'todo', id}, title?, ownerIds?}` -> `IssueRow[]` with `source = from` (an existing open issue for the same item is reused); `meetingReviewHeadline {headlineId}`.
- IDS: `idsFocus {issueIds}` (up to `settings.focusIssueCount`, default 3; replaces undiscussed picks), `idsStart {issueId?}`, `idsResolve {issueId, solved, todos?: [{title, ownerId, dueDate?}]}` (creates to-dos with `source {type:'issue', id}`, solves the issue when `solved`, auto-advances to the next focus issue; status goes `prioritizing -> discussing -> complete`).
- `meetingRate {score: 1-10}`: people only (agents get `forbidden`); `meetingSetSettings {sendRecap?, clearItems?, focusIssueCount?}`; `meetingCapture {todos?, issues?, headlines?, source?}` (notes agent; items tagged `source {type:'meeting', id}`).
- `meetingEnd {meetingId}`: pending to-dos -> done; stats + summary stored; if `clearItems` the team's done to-dos and reviewed headlines are soft-deleted (archived); returns `{meeting, stats, summary, recap, recapSent, cleared}`. **Call `endMeeting(ctx, {meetingId}, {requestId?, emailSender?})` instead** to also send the recap after commit through an `EmailSender` (`{ send(msg: {to, subject, text}): Promise<void> }`; process default via `setEmailSender(s)`, built-ins `noopEmailSender` (default) and `consoleEmailSender`), then `recapSentAt` is set. To-do completion rate = done / (to-dos created before the meeting that were open, or done since the previous meeting ended).
- `meetingHeartbeat(ctx, meetingId): Promise<boolean>`: presence ping (no audit row, no rev bump).

`getLiveState(ctx, meetingId, { sinceRev? }): Promise<LiveState | null>`; `null` when `sinceRev === state.rev`. Poll every 1-2 s with the last `rev`; use `serverTime` to correct clock skew: a running section's elapsed = `elapsedMs + (now - serverTime)`. Presence heartbeats do not bump `rev`, so refetch occasionally (or on join/leave events) for `online`.
```ts
type LiveState = {
  rev: number; serverTime: string /*ISO*/; meetingId: string; seriesId: string; teamId: string; name: string
  status: 'scheduled' | 'live' | 'paused' | 'ended'
  scheduledAt: string; startedAt: string | null; endedAt: string | null
  sectionIndex: number; paused: boolean; facilitatorId: string | null
  agenda: { index: number; term: string; minutes: number; elapsedMs: number; running: boolean }[]
  presence: { kind: 'person' | 'agent'; id: string; name: string; onBehalfOf?: string; joinedAt: string; lastSeen: string; online: boolean }[]
  attendees: { id: string; name: string; present: boolean; rated: boolean }[]          // series attendees
  settings: { sendRecap: boolean; clearItems: boolean; focusIssueCount: number }
  ids: { status: 'idle' | 'prioritizing' | 'discussing' | 'complete'; currentIssueId: string | null; focusIssueIds: string[]
         focusIssues: { id; title; ownerId; rank; status; discussed: boolean; solved: boolean }[]
         discussedIssueIds: string[]; solvedIssueIds: string[]; addedIssueIds: string[] }
  ratings: { count: number; mine: number | null; average: number | null; all: Record<personId, number> | null /*only after end*/ }
  counts: { openTodos; pendingTodos; doneTodos; newTodos; headlinesToReview; headlinesReviewed; openIssues }
  reviewedHeadlineIds: string[]; newTodoIds: string[]
  stats: MeetingStats | null; summary: string | null                                      // set after end
}
```
`meetings.state` (stored, `StoredMeetingState`): `{rev, sectionIndex, agenda (snapshot), timers: {[index]: {elapsedMs, runningSince}}, paused, presence, settings, focusIssueIds, idsState {status, currentIssueId, discussedIssueIds, solvedIssueIds, addedIssueIds, resolutions}, newTodoIds, newHeadlineIds, reviewedHeadlineIds, stats?}`; readers must go through `readState` (tolerates sparse/seed shapes).

### Search (`read`)
- `search(ctx, q, {types?: ('priority'|'metric'|'issue'|'todo'|'headline'|'person'|'meeting')[], limit?=20 (max 100)}) -> SearchHit[]` (`{type, id, title, subtitle?, status?, teamId?, ownerId?}`; ILIKE, `%`/`_` escaped, prefix matches first; `SEARCH_TYPES`).
- `myWeek(ctx) -> {personId, today, quarter, week, priorities, metricsDue, todos, nextMeeting}` for the acting person (an agent sees its owner's week).

### REST (`/api/v1`)
`GET/POST /issues`, `GET/PATCH /issues/:id`, `POST /issues/:id/{rank,solve,reopen,drop,move}`; `GET/POST /todos`, `GET/PATCH/DELETE /todos/:id`, `POST /todos/:id/{complete,uncomplete}`; `GET/POST /headlines`, `GET/PATCH/DELETE /headlines/:id`, `POST /headlines/:id/{review,cascade}`; `GET /meetings`, `/meetings/{templates,series,history,prepare}`, `POST /meetings/series`, `GET/PATCH /meetings/series/:id`, `POST /meetings/series/:id/schedule`, `POST /meetings/start`, `GET /meetings/:id`, `GET /meetings/:id/live?sinceRev=N` (204 when unchanged), `POST /meetings/:id/{heartbeat,join,leave,pause,resume,next-section,section,drop-to-issue,review-headline,ids/focus,ids/start,ids/resolve,rate,settings,capture,end}`; `GET /search?q=&types=a,b&limit=`, `GET /my-week`.
