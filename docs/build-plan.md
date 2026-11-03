# Build plan

**Status (2026-11-02): M0–M6 built.** Everything below exists in this repo and is covered by typecheck, unit tests (198), Playwright e2e and a production build. Not done yet: npm publishing (the release workflow is ready and needs `NPM_TOKEN`), building the Docker images (the Dockerfiles and compose file are written but have never been built here), a hosted docs site, and row-level security (org isolation is enforced in core and tested).

Milestones are ordered so a real team (Vindex) can run its weekly meeting on Movara as early as possible.

## M0 — Foundations (week 1)
- Monorepo (pnpm + Turborepo), `packages/config`, CI (typecheck, lint, test).
- `packages/db`: Drizzle schema for orgs, people, teams, agents, audit; migrations; RLS policies; seed with demo org.
- `packages/core`: command pattern (`actor`, `requestId`, `expectedVersion`), permission + scope checks, audit writer.
- `packages/terminology`: ship as built (schema, resolver, Standard pack) + JSON Schema export + tests.
- `packages/ui`: Tailwind theme from `movara.css` tokens (light + dark), shell, sidebar, list row, pill, meter, avatar + agent mark.
- Auth: Supabase Auth adapter + Auth.js adapter behind one interface.

## M1 — Run the quarter (weeks 2–3)
- Priorities + milestones (list + detail pane), Scorecard (grid, value entry, goal logic), Issues, To-dos, Headlines.
- Home "My week", ⌘K search, activity feed with actor provenance.
- REST `/api/v1` generated from core commands.

## M2 — MCP server (week 4)
- `apps/mcp` with the v1 tool catalog (`docs/mcp-tools.md`), OAuth 2.1, per-agent scopes, approvals flow.
- Settings → Connected agents, MCP & API keys, Audit log.
- Test with Claude Code, Claude Desktop and one n8n workflow (HubSpot → `metric_record_values`).

## M3 — Weekly meeting (weeks 5–6)
- Meeting series and templates (from the terminology pack), live meeting mode with realtime, IDS flow, wrap-up ratings, recap email, history.
- `meeting_capture` for a notes agent.

## M4 — Vision & structure (week 7)
- Vision plan (revisions, draft → publish, PDF export), Accountability chart (canvas + list, drafts, open seats linked to priorities).

## M5 — White-label & packs (week 8)
- Brand settings (wordmark/logo, accent with contrast check), modules on/off, calendar settings.
- Terminology: Custom overrides, Import pack (npm / URL / file → preview → apply), export pack; publish `@movara/terminology` and `@movara-community/pack-eos` to npm.

## M6 — Ship 0.1 (weeks 9–10)
- Docker Compose self-host, Supabase + Vercel one-click deploy template, docs site, demo data, security review, license (Apache-2.0), CONTRIBUTING, public repo.

## Decisions still open
1. Name: **Movara** (decided). Run a formal trademark search before the public launch, and claim the `@movara` npm scope (not yet verified as free).
2. Legal review of the EOS pack's name and attribution before publishing it.
3. ~~Auth for self-host~~: Better Auth (decided), with a built-in OAuth 2.1 server for MCP clients.
4. Hosted offering (a "Movara Cloud") or OSS only.
