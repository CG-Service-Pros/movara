# MCP server — tool catalog (v1)

Transport: streamable HTTP at `https://<org>.<host>/mcp` (and stdio for local dev).
Auth: OAuth 2.1 (PKCE). Each agent gets its own client, owner and scopes.

## Conventions

- **Tool names are canonical and never change** (`priority_set_status`). **Descriptions
  and returned labels use the org's terminology** ("Rock"), resolved per request.
- Every write accepts `requestId` (idempotency) and an optional `expectedVersion`.
- Every write returns `{ ok, entity, auditId }` or `{ needsApproval, approvalId }`.
- List tools page with `cursor` and default to compact rows. Use `*_get` for full detail.
- Dates are ISO 8601. Quarters are `YYYY-Qn`. Metric periods use `periodStart`.
- Errors are typed: `not_found`, `forbidden_scope`, `conflict`, `validation`,
  `needs_approval`.

## Scopes

`read` · `write:todos` · `write:issues` · `write:headlines` · `write:metrics` ·
`write:priorities` · `write:meetings` · `propose:vision` · `propose:chart` · `admin`
(packs, members, agents; always requires approval).

## Tools

| Area | Tool | Scope | Notes |
|---|---|---|---|
| Context | `org_overview` | read | org, terms in use, current quarter and week, teams, my role |
| | `search` | read | across all entities; returns typed hits |
| | `my_week` | read | the acting person's priorities, metrics due, to-dos, next meeting |
| Vision | `vision_get` | read | current published revision as structured sections |
| | `vision_propose_change` | propose:vision | creates a pending approval; nothing changes until a person approves, then it is applied and published with provenance |
| Chart | `chart_get` | read | seats, people, responsibilities |
| | `chart_propose_change` | propose:chart | draft + approval |
| Priorities | `priorities_list` | read | filters: quarter, team, owner, status |
| | `priority_get` | read | with milestones and activity |
| | `priority_create` | write:priorities | |
| | `priority_set_status` | write:priorities | on_track / off_track / done / not_done |
| | `milestone_toggle` / `milestone_add` | write:priorities | |
| Scorecard | `scorecard_get` | read | metrics × N periods, with on/off-track computed |
| | `metric_record_values` | write:metrics | batch: `[{ metricId \| metricTitle, periodStart, value, note? }]` |
| | `metric_create` | write:metrics | |
| Issues | `issues_list` | read | short/long-term, team, ranked |
| | `issue_create` | write:issues | `ownerIds[]` fan-out, `source` |
| | `issue_solve` / `issue_reopen` / `issue_move` | write:issues | |
| To-dos | `todos_list` | read | |
| | `todo_create` | write:todos | `ownerIds[]`, due defaults to +7 days |
| | `todo_complete` | write:todos | goes to `pending` while a meeting is live |
| Headlines | `headline_post` / `headline_cascade` | write:headlines | |
| Meetings | `meeting_get` | read | agenda, state, attendees |
| | `meeting_prepare` | read | pre-read: off-track metrics/priorities, open issues, overdue to-dos |
| | `meeting_start` / `meeting_next_section` / `meeting_end` | write:meetings | facilitator or delegated |
| | `ids_focus_issue` / `ids_resolve` | write:meetings | `{ issueId, solved, todos? }` |
| | `meeting_end_day` / `meeting_start_day` | write:meetings | two-day sessions (annual planning): pause after day 1, resume on day 2 |
| | `meeting_capture` | write:meetings | notes agent: add to-dos/issues/headlines tied to the live meeting |
| | `meeting_rate` | write:meetings | people only (agents cannot rate) |
| Terminology | `terminology_get` | read | |
| | `terminology_preview_import` | admin | validate + diff only |
| | `terminology_apply` | admin | always needs approval |
| Approvals | `approvals_list` / `approval_status` | read | an agent can poll its own requests |

## Resources (subscribable)

`movara://org/overview` · `movara://quarter/current` · `movara://team/{id}/scorecard` ·
`movara://meeting/{id}/live` (pushes state changes during a meeting).

## Prompts

`weekly-meeting-prep` · `issue-triage` · `quarterly-planning` · `write-a-good-priority`
(teaches the SMART-ish shape) · `metric-from-hubspot` (example integration).
