# Movara

**An open-source, agent-first business operating system.** Run your company on a quarterly rhythm: vision, quarterly priorities, a weekly scorecard, issues, to-dos and a weekly meeting. Every action a person can take is also available to AI agents through an [MCP](https://modelcontextprotocol.io) server, with the same permissions, approvals and audit trail.

Movara is **white-label**: your logo, your accent color and your own words. Vocabulary lives in swappable [terminology packs](docs/terminology-packs.md), so the same product can say "Priorities" or "Rocks" depending on how your team talks.

> Status: pre-1.0 (0.1). The data model and MCP tool catalog may still change between minor versions.

## Why Movara

- **Agent-first.** One domain layer (`@movara/core`) sits behind the web UI, the REST API and the MCP server. An agent can never do something a person can't, and the reverse holds too. Agents have scopes, idempotent writes (`requestId`), optimistic concurrency (`expectedVersion`), human approvals for sensitive actions, and everything they write shows its provenance.
- **White-label.** Brand settings (wordmark, logo, accent), modules on/off, calendar settings, and terminology per organization.
- **Terminology packs.** Every label, email and MCP tool description is resolved from the org's pack plus its own overrides. The core ships neutral "Standard" terms. Community packs (for example the EOS pack) are data-only JSON that you import, preview and can revert.
- **Self-host or cloud.** PGlite (embedded Postgres) for zero-setup development, PostgreSQL 16 for real deployments. Docker Compose, or Vercel + Supabase.

## Features

- Home ("My week"), command palette, activity feed with actor provenance
- Quarterly priorities with milestones, owners, teams and status
- Weekly scorecard: metrics, goals, value entry, history
- Issues list (short and long term) and to-dos
- Headlines, weekly meetings and templates
- Vision plan and accountability chart
- Settings: general, brand, terminology (import / export / per-term overrides), modules, calendar, members, agents, API keys, approvals, audit log
- REST API (`/api/v1`) and an MCP server (streamable HTTP and stdio) with scoped agent keys
- Light and dark themes

Which areas are fully built at any point in time is tracked in [docs/build-plan.md](docs/build-plan.md).

## Screenshots

Screenshots are not committed to the repository. The visual reference is a set of interactive design mockups (React + CSS) in [`design/stageshow/examples/`](design/stageshow/examples/):

| Area | Mockup |
|---|---|
| Priorities | [`movara-priorities`](design/stageshow/examples/movara-priorities/) |
| Scorecard | [`movara-scorecard`](design/stageshow/examples/movara-scorecard/) |
| Weekly meeting | [`movara-meeting`](design/stageshow/examples/movara-meeting/) |
| Vision | [`movara-vision`](design/stageshow/examples/movara-vision/) |
| Agents | [`movara-agents`](design/stageshow/examples/movara-agents/) |
| Terminology and pack import | [`movara-terms`](design/stageshow/examples/movara-terms/), [`movara-pack-import`](design/stageshow/examples/movara-pack-import/) |
| Chart | [`movara-chart`](design/stageshow/examples/movara-chart/) |
| Dark / mobile | [`movara-dark`](design/stageshow/examples/movara-dark/), [`movara-mobile`](design/stageshow/examples/movara-mobile/) |

To view them: `cd design/stageshow && npm install && npm run dev` (or `./restart-preview.sh` to serve on port 5199), then open the example you want. Design principles and the visual system are in [docs/design-plan.md](docs/design-plan.md).

## Quickstart

Requirements: Node 22 and pnpm 10 (`corepack enable`).

```bash
git clone https://github.com/movara-app/movara.git
cd movara
pnpm install
pnpm dev
```

Open <http://localhost:3000>. With `DATABASE_URL` unset, Movara uses an embedded PGlite database in `.data/pglite`, applies migrations and seeds a demo organization on first run:

- Sign in: `demo@movara.local` / `movara-demo`
- Organization: `/vindex`
- Reset the demo data at any time: `pnpm db:reset`

To use a real Postgres, copy [`.env.example`](.env.example) to `.env` and set `DATABASE_URL=postgres://user:pass@host:5432/movara`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `APP_URL`. Then `pnpm db:migrate` (and optionally `pnpm db:seed`).

Useful scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm --filter @movara/web e2e` (Playwright smoke test against a throwaway PGlite database).

## Connect an agent (MCP)

Create an agent in **Settings -> Agents**, issue an API key (`mk_live_...`), then for example:

```bash
claude mcp add --transport http movara http://localhost:3000/mcp \
  --header "Authorization: Bearer mk_live_..."
```

In the seeded demo org there is a demo key (`mk_live_demo_ops_agent_0000000000000000`); never seed demo data into production. Full guide for Claude Code, Claude Desktop, Cursor, n8n and plain HTTP: [docs/mcp-setup.md](docs/mcp-setup.md). Tool catalog: [docs/mcp-tools.md](docs/mcp-tools.md).

## Terminology packs

A pack maps term keys to words (`priority -> Rock`) and may add meeting templates. Packs are validated JSON; no pack code ever runs. Import from an npm name, a URL or a file in **Settings -> Terminology**, preview the changes, apply, and revert in one click.

- Spec and format: [docs/terminology-packs.md](docs/terminology-packs.md)
- Neutral built-in pack and schema: [`packages/terminology`](packages/terminology/)
- Example community pack (EOS): [`packs/eos`](packs/eos/)
- Writing your own: see [CONTRIBUTING.md](CONTRIBUTING.md#writing-a-terminology-pack)

## Architecture

```
apps/web              Next.js 16 app: UI, server actions, REST /api/v1, auth, /mcp route
apps/mcp              MCP server (streamable HTTP + stdio); also mounted by the web app at /mcp
packages/core         Domain commands and queries, scopes, approvals, audit, quarter math
packages/db           Drizzle schema, migrations, seed, client (Postgres or PGlite)
packages/terminology  Term keys, pack schema, resolver, Standard pack   (published: @movara/terminology)
packages/ui           Design-system primitives (Tailwind v4 + Radix)
packages/config       Shared tsconfig and vitest config
packs/eos             Community EOS terminology pack                     (published: @movara-community/pack-eos)
design/stageshow      Interactive design mockups
docs/                 Documentation (start at docs/README.md)
docker/               Dockerfiles and docker-compose.yml for self-hosting
```

All writes flow through `@movara/core` commands: validate, check scope and role, idempotency, optional approval for agents, transaction, audit event. Details in [docs/architecture.md](docs/architecture.md) and [docs/engineering.md](docs/engineering.md).

Stack: Node 22, pnpm workspaces + Turborepo, TypeScript (strict), Next.js 16 / React 19, Tailwind CSS v4, Drizzle ORM on PostgreSQL 16 (PGlite for dev), Better Auth, Zod 4, `@modelcontextprotocol/sdk`, Vitest, Playwright.

## Deploy

| Option | Guide |
|---|---|
| Docker Compose (Postgres + web + MCP) | [docs/deploy-docker.md](docs/deploy-docker.md) |
| Vercel + Supabase | [docs/deploy-vercel-supabase.md](docs/deploy-vercel-supabase.md) |

## Documentation

Everything is indexed in [docs/README.md](docs/README.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Copyright 2026 Vindex Consulting / Oscar Hidalgo and contributors. See [NOTICE](NOTICE).

## Trademarks and affiliation

"Movara" here is the name of this open-source project. It is not affiliated with, endorsed by or related to any commercial product or company that uses a similar name.

EOS(R), Traction(R), Level 10 Meeting(TM), V/TO(TM) and related terms are trademarks of EOS Worldwide, LLC. Movara's core ships neutral terminology and does not use those terms. The optional community pack in `packs/eos` is unofficial, is not affiliated with or endorsed by EOS Worldwide, and displays an attribution while it is active. All other trademarks belong to their respective owners.
