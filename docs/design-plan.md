# Movara — Design plan

*Working name. Date: 2026-11-02.*

Movara is an open-source operating system for running a company on a quarterly rhythm:
vision, quarterly priorities, a weekly scorecard, issues, to-dos and a weekly meeting.
It is **agent-first**: anything a person can do, an agent can do through the MCP server,
and the UI always shows who did it.

Mockups: `design/stageshow/examples/movara-*` (React + the Stageshow kit). Stills are in
`design/stageshow/shots/`. Run `cd design/stageshow && npm run dev` to play them.

## 1. Principles

1. **Calm by default, loud only for status.** Neutral cool grays carry the UI. Color is
   reserved for meaning: green on track, red off track, the brand accent for selection and
   primary actions. Nothing is colored for decoration.
2. **One screen, one job.** Lists on the left, the selected item's detail on the right. No
   modal stacks. Edits happen in place.
3. **Agents are visible colleagues, not magic.**
   - People are circles; agents are rounded squares with one glyph, everywhere.
   - Agent writes carry provenance: an activity line naming the agent, the tool, the source
     system and the human it acts for. A value an agent wrote keeps a small mark.
   - No sparkles, no purple "AI" color. We show what the agent did.
4. **Keyboard-first.** ⌘K command menu and search everywhere; every list is navigable with
   arrow keys; `n` creates, `s` sets status, `.` opens actions.
5. **The meeting is the product's heartbeat.** Meeting mode swaps the navigation for the
   agenda, keeps a clock in view, and turns every list into a review step.
6. **White-label to the core.** The customer's wordmark sits where our logo would. Accent,
   logo and **terminology** come from settings, so the product reads as theirs.

## 2. Visual system

| Token | Value | Notes |
|---|---|---|
| Font | Inter (system fallback) | `cv11`, `ss01`; tabular numbers for all figures |
| Type scale | 11.5 / 12.5 / 13 / 17 / 18 / 30 | 13px body; one weight step for hierarchy |
| Neutrals | zinc-like cool grays (`#15181d` → `#f6f7f9`) | canvas `#f6f7f9`, surface `#fff`, line `#e6e8ec` |
| Accent | `#2f5bea` default | **replaced per installation** (brand setting) |
| Status | success `#18a058`, danger `#e5484d`, warning `#e8a317` | status only; always paired with a shape (ring, gapped ring, check) for color-blind safety |
| Radius | 6 / 8 / 10 / 12 | controls 8, cards 10–12, pills full |
| Density | rows 44px (lists), 48px (scorecard), 28px (nav) | |
| Icons | Lucide, 15px, stroke 1.7 | one set, one size |
| Dark mode | same tokens, surfaces step lighter for depth | ships at v1 |

The source of truth for these is `design/stageshow/examples/_movara/movara.css`. It will
become the app's Tailwind theme and CSS variables.

## 3. Information architecture

```
[Customer wordmark ▾]        ← org switcher, settings, profile
Search ⌘K
Home                         ← my week: my priorities, my metrics, my to-dos, next meeting
My to-dos
── <Team> ──────────────     ← one block per team the user belongs to
Weekly meeting               ← series, history, start/join
Priorities                   ← quarter selector; company / team / mine
Scorecard
Issues
── Company ─────────────
Vision plan
Accountability
── Workspace ───────────
Agents                       ← connected agents, scopes, tokens, audit log
```

The labels in this tree come from the active **terminology pack**.

## 4. Key screens (mocked)

| Mockup | Story it tells | Notes |
|---|---|---|
| `movara-priorities` | Home of a team's quarter: progress summary, priority list, detail pane. An agent ticks a milestone over MCP and the change lands everywhere. | List + detail split, milestone meters, an activity feed with agent provenance |
| `movara-terms` | Settings → Terminology. Switching Standard → EOS renames the sidebar, the page and the agent tools at once. | Packs: Standard (default), EOS, Custom (edit each term) |
| `movara-scorecard` | A sales agent records this week's number from HubSpot via `record_metric_values`; the cell goes from Missing to on track and the count rolls. | Off-track cells tinted; missing values explicit; agent-written values marked |
| `movara-meeting` | Live weekly meeting in issue-solving: agenda rail with timers, the focused issue, a to-do captured by the notes agent, Mark solved. | Meeting mode, Identify · Discuss · Solve stepper, ranked queue |
| `movara-pack-import` | Settings → Terminology → Import pack: type an npm name, preview what changes, apply. | Data only, no code runs; attribution shown |
| `movara-agents` | Connected agents: scopes per agent, an approval request from the Notes Agent, audit log, MCP endpoint. | Human-in-the-loop for consequential changes |
| `movara-vision` | The Vision plan as one page, long view and this year. The agent-proposed goal shows its provenance. | Published revisions, drafts, PDF |
| `movara-chart` | Accountability chart: seats with responsibilities, an open seat linked to its hiring priority, an agent assisting a seat. | Chart / list views, drafts |
| `movara-mobile` | "My week" on a phone: next meeting, report numbers, to-dos. | Mobile web/PWA first |
| `movara-dark` | The Priorities screen in dark theme. | Same tokens by role |

## 5. Customization (settings)

- **Brand**: wordmark text or logo (light/dark), favicon, accent color (contrast-checked),
  optional login background, email sender name.
- **Terminology**: a pack (Standard, EOS, Custom) plus per-term overrides. Terms flow into UI
  labels, emails, exports **and MCP tool descriptions**, so agents speak the company's
  language.
- **Modules**: turn off what a company doesn't use (e.g. Accountability chart, Assessments).
- **Calendar**: fiscal year start, quarter definitions, week start day, timezone.

Trademark note: "EOS", "Rocks", "Level 10", "V/TO", "A/C" and similar terms are trademarks
of EOS Worldwide. The EOS pack's label and description must be reviewed before public release.
It may need to ship as a community-provided pack.

## 6. Components to build (v1)

App shell (sidebar, inset content panel, toolbar) · command menu · list row · detail pane ·
status glyph + pill · progress meter · milestone checklist · scorecard grid (editable cells,
goal logic, trend) · person avatar + agent mark + facepile · activity feed with provenance ·
meeting agenda rail + clock · IDS stepper · segmented control · settings panel · toasts.

Stack for the app: Next.js + Tailwind + Radix primitives (shadcn-style, themed with the
tokens above). Supabase (Postgres, Auth, Realtime for live meetings) and Vercel as the
reference deployment, with Docker Compose for self-hosting.

## 7. Still to design during the build

Onboarding (create org, import pack, invite team, connect first agent), Home (My week on
desktop), Issues list, meeting history and summary, the planning-session agenda, empty
states, and a frame-by-frame movara review of the animated mockups.
