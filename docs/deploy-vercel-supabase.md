# Deploy: Vercel + Supabase

Reference cloud setup: Supabase provides PostgreSQL, Vercel hosts the Next.js app. Movara talks to Postgres through Drizzle with a plain `DATABASE_URL`, so Supabase is "just Postgres" here (no Supabase client SDK is required).

## 1. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard> (pick a region close to your Vercel region). Save the database password.
2. Open **Connect** (top bar) and copy two connection strings:
   - **Direct connection** (`postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres`): for migrations. Direct connections are IPv6 on the free tier; if your machine has no IPv6, use the **Session pooler** string (port 5432) for migrations instead.
   - **Transaction pooler** (`postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`): for the app on Vercel. Serverless functions open many short-lived connections, so use the pooler.
3. URL-encode special characters in the password.

> **Session vs transaction pooler.** The transaction pooler (port 6543) cannot serve named prepared statements. Movara's driver (postgres-js)
> turns prepared statements **off automatically** when `DATABASE_URL` has port `6543`, a `*.pooler.*` host or `?pgbouncer=true`, so the
> transaction pooler string works as-is (the `pgbouncer` parameter is stripped before connecting). The **session pooler** (port 5432 on the
> pooler host) also works, but because its host contains `pooler.` prepared statements are disabled there too; set `DATABASE_PREPARE=1` to
> force them back on, or `DATABASE_PREPARE=0` to force them off anywhere else. Rule of thumb: Vercel/serverless app -> transaction pooler (6543);
> migrations (`pnpm db:migrate`) -> direct or session pooler (5432), since DDL and long sessions do not belong on the transaction pooler.

## 2. Run migrations

From your machine, once, and again after each upgrade that includes new migrations:

```bash
git clone https://github.com/OscarH30/movara.git && cd movara
pnpm install
DATABASE_URL='<direct or session-pooler connection string>' pnpm db:migrate
```

The web app also applies pending migrations on its first request, so this step mainly lets you fail early and keep schema changes out of request time.

Optional demo data (demo org `vindex`, login `demo@movara.local` / `movara-demo`, **demo API key**):

```bash
DATABASE_URL='...' pnpm db:seed
```

Do not seed a production database. Without `MOVARA_SEED_DEMO`, the app only auto-seeds embedded PGlite in development, never Postgres and never a production server.

## 3. Create the Vercel project

1. **Add New -> Project**, import your fork of the GitHub repository.
2. **Root Directory:** `apps/web`. Keep "Include source files outside of the Root Directory" **enabled** (the default): the app imports workspace packages and mounts the MCP route from `apps/mcp/src`.
3. Framework preset: Next.js (detected). Vercel runs `pnpm install` for the workspace and `next build`. `apps/web/vercel.json` pins the framework.
4. Node.js version: 22.x (Project Settings -> General).

### Environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** string (port 6543; prepared statements are disabled automatically) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public URL, e.g. `https://movara.example.com` |
| `APP_URL` | Same public URL (used in emails and links) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Your SMTP provider (invitations, recaps). Without SMTP, emails are only logged |
| `MOVARA_TERMINOLOGY_PACKS` | Optional, e.g. `@movara-community/pack-eos` |
| `MOVARA_SEED_DEMO` | Leave unset or `0` in production |

Set them for Production (and Preview if you use previews; use a separate database for previews). Deploy. If you set the production domain after the first deploy, update `BETTER_AUTH_URL` and `APP_URL` and redeploy.

### First sign-in

Open the URL, **Create an account**, and complete onboarding to create your organization. (Only the seeded demo has the demo login.)

## 4. MCP for agents

- **Web route (default):** `https://<your-domain>/mcp` is served by the same deployment. It authenticates with OAuth (Claude, ChatGPT and Cursor sign in through Movara's consent screen; `APP_URL` must be the public URL) or Bearer agent keys from Settings -> Agents.
- **Important: serverless caveat.** MCP sessions (the `Mcp-Session-Id` returned by `initialize`) are kept **in process memory**. On Vercel, requests can land on different function instances, so a later call may not find the session and fail. This works for quick tests but is not reliable for real agents.
- **Recommended for production:** run the standalone MCP server (`apps/mcp`, port 3333) on a long-running host such as **Fly.io** or **Render**, pointing at the same `DATABASE_URL`:
  - Build with [`docker/Dockerfile.mcp`](../docker/Dockerfile.mcp) (`docker build -f docker/Dockerfile.mcp -t movara-mcp .`), expose port 3333, health check `GET /healthz`.
  - Fly.io: `fly launch --dockerfile docker/Dockerfile.mcp --internal-port 3333`, then `fly secrets set DATABASE_URL=...`. Keep a single machine (or sticky routing) because sessions are in memory.
  - Render: a Web Service from the repo using that Dockerfile, env `DATABASE_URL`, health check path `/healthz`.
  - Point clients at `https://<mcp-host>/mcp`. See [mcp-setup.md](mcp-setup.md).

## 5. Troubleshooting

- **`too many connections`:** use the pooler string, not the direct one.
- **`prepared statement "…" does not exist` / `already exists`:** a pooler URL was not recognised (custom host). Set `DATABASE_PREPARE=0`.
- **`output: 'standalone'`:** `next.config.ts` enables it for Docker; Vercel ignores it and builds as usual.
- **Sign-in redirects or cookie errors:** `BETTER_AUTH_URL` / `APP_URL` must exactly match the URL in the browser (scheme and host).
- **Build cannot find workspace packages:** Root Directory must be `apps/web` with source files outside the root enabled, and the lockfile (`pnpm-lock.yaml`) must be committed.
- **Migrations from a laptop time out:** switch to the session pooler string.
