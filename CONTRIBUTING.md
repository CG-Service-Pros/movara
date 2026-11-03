# Contributing to Movara

Thanks for helping. Movara is Apache-2.0 licensed; by contributing you agree your contribution is licensed under the same terms. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, do **not** open a public issue: see [SECURITY.md](SECURITY.md).

## Setup

Requirements: Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
git clone https://github.com/OscarH30/movara.git && cd movara
pnpm install
pnpm dev            # http://localhost:3000, embedded PGlite, demo data seeded
```

Demo login: `demo@movara.local` / `movara-demo`, org `/vindex`. `pnpm db:reset` wipes and re-seeds the local database.

| Command | What it does |
|---|---|
| `pnpm typecheck` | Typecheck every package |
| `pnpm test` | Vitest (core runs against in-memory PGlite) |
| `pnpm build` | Build everything |
| `pnpm --filter @movara/web e2e` | Playwright smoke test (own port 3301, throwaway database). Uses installed Chrome; set `CI=1` to use Playwright's Chromium (`pnpm --filter @movara/web exec playwright install chromium`) |
| `pnpm db:generate` | Generate a Drizzle migration after a schema change |
| `docker compose -f docker/docker-compose.yml --env-file docker/.env up --build` | Full self-host stack |

## Conventions (summary of [docs/engineering.md](docs/engineering.md))

- **Stack is fixed:** TypeScript strict + ESM, Next.js App Router with server actions, Tailwind v4, Drizzle, Better Auth, Zod 4, Vitest. Discuss in an issue before proposing to swap something or add a dependency.
- **Everything goes through `@movara/core`.** UI server actions, REST and MCP call core commands and queries. No database writes outside core.
- **Commands** use `defineCommand({ name, scope, input, run })` and run through `execute(ctx, command, input, { requestId?, expectedVersion? })`, which validates, checks scopes, handles idempotency and approvals, runs in a transaction and writes the audit event.
- **Org isolation:** every query and write filters by `ctx.orgId`. Add tests that cross-org access returns `not_found`.
- **Errors:** throw `MovaraError(code, message)` with `not_found | forbidden | forbidden_scope | conflict | validation | needs_approval`.
- **Terminology:** never hard-code a concept name ("Priority") in the UI or MCP descriptions; use the resolved term (`t(key, form)`).
- **UI:** every page has an empty state. People are circle avatars, agents are rounded squares with the bot glyph, and anything an agent wrote shows provenance. Design tokens and rationale: [docs/design-plan.md](docs/design-plan.md).
- **Web layout:** routes in `apps/web/app/(app)/[org]/<area>`, area components in `apps/web/components/<area>`, primitives in `packages/ui/src` (one file per component).
- **MCP:** tool names are canonical and stable; only descriptions and labels follow the org's terminology. See [docs/mcp-tools.md](docs/mcp-tools.md).

## Writing a terminology pack

A pack is a JSON file validated by the schema in [`packages/terminology/src/schema.ts`](packages/terminology/src/schema.ts) (JSON Schema: `packages/terminology/schema/terminology-pack.schema.json`). It is data only; no code runs.

1. Copy [`packs/eos/pack.json`](packs/eos/pack.json) as a starting point and set a unique reverse-DNS-ish `id` (for example `community.mycompany`), `name`, semver `version` and `format: 1`.
2. Map term keys to words under `terms`, each with `singular`, `plural` and optionally `short` / `description`. Partial packs are fine: missing keys fall back to Standard. Valid keys are listed in `TERM_KEYS` in the schema file.
3. Optionally add `meetingTemplates` whose agenda items reference term keys.
4. If your terms include someone else's trademarks, add an `attribution` string. Movara shows it while the pack is active. Never imply affiliation or endorsement.
5. Validate and try it: Settings -> Terminology -> Import pack -> File. The preview lists every change before you apply, and you can revert.
6. Publish (optional): an npm package with `pack.json` in the root (see [`packs/eos/package.json`](packs/eos/package.json)); keyword `movara-pack`; peer-depend on `@movara/terminology`. Orgs can then import it by npm name.

Packs for trademarked vocabularies belong in separate community packages, not in the core terms.

## Pull request checklist

- [ ] Focused change; linked issue for anything non-trivial
- [ ] `pnpm typecheck` and `pnpm test` pass; new behavior has tests (core: including cross-org isolation)
- [ ] `pnpm --filter @movara/web e2e` passes if you touched the web app
- [ ] Schema change: `pnpm db:generate` output committed (migration + `migrations.generated.ts`)
- [ ] UI text uses terminology keys; empty states, light and dark themes checked
- [ ] Agent-facing change: MCP tool/description docs updated; scopes and approvals considered
- [ ] Docs updated (`docs/`, README) where behavior or setup changed
- [ ] No secrets, personal data or generated files committed; `.env.example` updated if you added an environment variable
- [ ] Commit messages are clear (imperative, explain the why)
