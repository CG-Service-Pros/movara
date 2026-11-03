# Architecture

## Principles

- **One domain layer, three doors.** All business rules live in `@movara/core`. The web app
  (server actions), the REST API and the MCP server are thin adapters over it. An agent can
  never do something the UI can't, and the reverse holds too.
- **Every write has an actor.** `actor = { type: 'person' | 'agent', id, onBehalfOf? }`
  is required by every core command and lands in the audit log.
- **Idempotent, versioned writes.** Commands accept `requestId` (idempotency key). Mutable
  records carry `version` for optimistic concurrency. A stale write returns a conflict with
  the current state.
- **Postgres is the source of truth; realtime is a projection.** Live meetings and
  presence use Supabase Realtime (or a Postgres LISTEN/NOTIFY adapter when self-hosted).
- **Tenant isolation in the database.** Every table has `org_id`, with row-level security
  policies keyed to the session's org. Agents get the same RLS as the person they act for,
  narrowed by their scopes.

## Monorepo

```
movara/
  apps/
    web/                 Next.js (App Router) UI + server actions + REST /api/v1
    mcp/                 MCP server (TypeScript SDK): streamable HTTP + stdio, OAuth 2.1
  packages/
    core/                domain commands/queries, permissions, scopes, audit, events
    db/                  Drizzle schema, migrations, RLS policies, seed
    terminology/         term keys, pack schema, resolver, Standard pack
    ui/                  design system (Tailwind theme from movara.css tokens, Radix-based components)
    config/              shared tsconfig, eslint, tailwind preset
  packs/
    eos/                 @movara-community/pack-eos (moves to its own repo before 1.0)
  design/stageshow/      mockups
  docs/
  docker/                docker-compose.yml (postgres, web, mcp)
```

Tooling: pnpm workspaces + Turborepo, TypeScript strict, Vitest, Playwright for e2e,
Biome or ESLint+Prettier, Changesets for package releases.

## Deployment targets

| Target | Database/Auth/Realtime | App hosting |
|---|---|---|
| Reference cloud (most users) | Supabase (Postgres, Auth, Realtime, Storage) | Vercel (web + MCP as a route or separate project) |
| Self-host | Postgres 16 + built-in auth (Auth.js) + LISTEN/NOTIFY | `docker compose up` |

The web app talks to Postgres through Drizzle, never through Supabase-only APIs, except
behind small adapters (`auth`, `realtime`, `storage`). That keeps self-hosting first-class.

## Data model (v1)

Common columns on every table: `id uuid`, `org_id`, `created_at`, `created_by_actor`,
`updated_at`, `updated_by_actor`, `version int`, `deleted_at` (recycle bin).

| Table | Key columns |
|---|---|
| `orgs` | name, slug, timezone, fiscal_year_start_month, quarter_calendar jsonb, week_start_day, branding jsonb (wordmark, logo urls, accent), terminology_pack jsonb, terminology_overrides jsonb, modules jsonb |
| `people` | user_id (auth), name, email, avatar_url, role (owner/admin/member/viewer), timezone, reminder_schedule jsonb |
| `agents` | name, owner_person_id, client (free text), auth (oauth_client_id or api key hash), scopes text[], status, last_seen_at |
| `teams` | name, parent_team_id, leader_id, is_leadership |
| `team_members` | team_id, person_id, role |
| `vision_plans` / `vision_revisions` | plan: scope (company/team), team_id · revision: number, status (draft/published), content jsonb (sections), published_at, published_by |
| `charts` / `chart_revisions` / `seats` | revision status · seat: title, parent_seat_id, sort, responsibilities text[], person_ids uuid[], assisting_agent_ids uuid[], team_id |
| `priorities` | title, description, owner_id, team_id, quarter (e.g. 2026-Q4), due_date, level (company/team/individual), status (on_track/off_track/done/not_done/dropped), parent_priority_id |
| `milestones` | priority_id, title, due_date, done_at, sort |
| `scorecards` | team_id, interval (day/week/month/quarter), week_start_day, periods_shown |
| `metrics` | scorecard_id, title, owner_ids uuid[], comparison (gte/lte/gt/lt/eq/between), goal, goal_upper, unit (number/percent/currency/duration/boolean), scale, decimals, additive, sort, source jsonb (e.g. HubSpot) |
| `metric_values` | metric_id, period_start date, value numeric, note, entered_by_actor · unique(metric_id, period_start) |
| `issues` | title, description, owner_id, team_id, horizon (short/long), rank, status (open/solved/dropped), solved_at, source jsonb {type,id} |
| `todos` | title, description, owner_id, team_id (null = personal), due_date, status (open/pending/done), done_at, source jsonb |
| `headlines` | text, kind (customer/employee/general), owner_id, team_id, reviewed_at, cascaded_from_id |
| `meeting_series` | team_id, template_key, agenda jsonb [{term,minutes}], rrule, attendee_ids, facilitator_id, scribe_actor |
| `meetings` | series_id, scheduled_at, started_at, ended_at, state jsonb (section index, timers, ids_state, focus_issue_ids), ratings jsonb, summary, recap_sent_at |
| `approvals` | requested_by_actor, action (command name), payload jsonb, status (pending/approved/declined), decided_by, decided_at |
| `audit_events` | actor jsonb, on_behalf_of, command, entity_type, entity_id, diff jsonb, request_id, at |
| `api_keys` / `oauth_*` | hashed secrets, scopes, expiry |
| `org_ai_settings` | enabled, provider (openai / openai_compatible), base_url, api_key ciphertext+iv+tag (AES-256-GCM), model, reasoning_effort, monthly_token_limit, coach_name, coach_personality |
| `coach_threads` / `coach_messages` / `ai_usage` | per-person chats (messages: role, content, tool_calls, usage) · token usage per feature (coach / extract) |
| `meeting_notes` | meeting_id, source_app (granola, plaud, manual, coach), source_url, title, notes_markdown, transcript, captured_by_actor |
| `capture_items` | meeting_id, notes_id, kind (todo/issue/headline/decision), payload jsonb, status (proposed/accepted/rejected/edited), created_entity_id, decided_by/at |

Domain rules worth encoding in `core` (from the research):
- Ticking a to-do during a meeting sets `pending`; it becomes `done` when the meeting ends.
  This keeps the meeting's completion rate honest.
- Creating an issue, to-do or headline accepts `ownerIds[]` and fans out into one record per
  owner.
- Dropping a metric, priority, headline or to-do "to issues" creates an issue with
  `source = {type, id}` (structured provenance, not text in the notes).
- Quarter math (current quarter, week N of 13) comes from the org's calendar settings.
- Commands that need approval (publish vision, delete, change permissions, apply a pack)
  create an `approvals` row instead of executing when the actor is an agent.

## Coach (built-in AI assistant)

Coach is an in-app assistant that uses the **same tools as MCP agents**. `getToolRegistry(ctx, terms)` (apps/mcp) returns the tool list
(name, description, zod schema, `readOnly`/`consequential`, `run`) with no transport; the MCP server is built from it and the AI engine feeds the
same list to the model. Identity: every org lazily gets one `builtin_coach` agent record (`ensureCoachAgent`, hidden and irrevocable). When a
person chats, Coach acts through `coachCtxFor(personCtx)`: actor = Coach `onBehalfOf` the person, role = the person's role, so it can never do more
than that person and the audit log shows who asked. Provider configuration lives in `org_ai_settings` (OpenAI or any OpenAI-compatible endpoint;
the API key is encrypted at rest with a key derived from `MOVARA_ENCRYPTION_KEY` or `BETTER_AUTH_SECRET` and never returned); token usage is
recorded in `ai_usage` and a monthly limit is enforced before each call. The engine is `packages/coach` (`@movara/coach`: agent loop of at most 8 tool steps; read tools run automatically, every write waits for a confirm card; OpenAI Responses API, Chat Completions for `openai_compatible`; `MOVARA_AI_MOCK=1` swaps in a deterministic fake model); routes are `apps/web/app/api/coach/*` (SSE) and the panel is `apps/web/components/coach`.

## Meeting-notes capture

Companies record meetings with services such as Plaud or Granola. Their agents push the organized notes and action items into an **existing
meeting** via MCP/REST (`meeting_capture_notes`, `POST /api/v1/meetings/:id/notes`; find the meeting with `meetings_find`). Notes land in
`meeting_notes`; action items become `capture_items` with status `proposed`, with owners resolved from free text (e-mail, name, first name, "me").
People review them (accept, edit, reject); accepting creates real to-dos/issues/headlines through the normal commands, with
`source = { type: 'meeting_notes', id }`. Agents can auto-accept only if an admin enabled `settings.capture.autoAcceptFromAgents` and the agent holds
the write scopes. If a call has no items and an AI extractor is registered (`setNotesExtractor`), items are extracted from the notes. Scope presets
(`personal_assistant`, `notes_integration`, `team_operator`, `read_only`) and the `write:own_todos` / `capture:meetings` scopes make "my agent may
manage my own to-dos and file meeting notes, nothing else" a one-click choice at OAuth consent.

## Realtime (live meetings)

Server-authoritative meeting state in `meetings.state`. Clients send commands
(`meeting.next_section`, `ids.focus`, `ids.resolve`, `meeting.rate`, `meeting.end`). Core
validates them, persists state and emits an event. The realtime adapter broadcasts on
channel `meeting:{id}`. Agents get the same events through MCP resource subscriptions.

## Security

Row-level security on every table. Scopes are checked in core before any write. Agent
tokens are short-lived (OAuth 2.1 with PKCE for MCP clients; static API keys for
server-to-server integrations, hashed). Rate limits apply per agent. Pack imports are
data-only (JSON validated with Zod; no code execution). The audit log is append-only.
