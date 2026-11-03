# CG Service Pros deployment

This fork belongs to [CG-Service-Pros/movara](https://github.com/CG-Service-Pros/movara).
Keep `OscarH30/movara` as the read-only `upstream` remote. Make changes on a branch
and open a pull request against the CG fork.

## Infrastructure

- Vercel project: `cg-movara`, in the team that hosts `cgwebsite` and `cgrm`.
- Root directory: `apps/web`, with workspace sources outside the root enabled.
- Runtime: Node 22, Vercel region `iad1`.
- Database: a dedicated `cg-movara` Supabase project in **CG Service Pros**, region `us-east-1`.
- Supabase project reference: `hburzfdggmdilgznaicf` (PostgreSQL 17).
- Production origin: `https://cg-movara.vercel.app`.
- Authentication: Movara's existing Better Auth; Supabase supplies PostgreSQL only.

Follow [the deployment guide](deploy-vercel-supabase.md) for connection strings.
Store `DATABASE_URL` and a generated `BETTER_AUTH_SECRET` only as sensitive Vercel
production variables. Set `APP_URL` and `BETTER_AUTH_URL` to the final HTTPS origin.
Set `MOVARA_SEED_DEMO=0` and `MOVARA_ALLOW_SIGNUP=0`.
Never connect branch previews to the production database.

## Database setup and upgrades

1. Run `pnpm db:migrate` with the direct or session-pooler database connection.
2. Run [the hardening SQL](sql/supabase-server-only.sql) as the database owner
   against this dedicated project. Repeat after migrations that add tables.
3. Confirm every `public` table has RLS enabled and neither `anon` nor
   `authenticated` has table privileges. Verify an anonymous REST request cannot
   read `public.user` or `public.orgs`.
4. Use the transaction pooler for the application. The server connects as
   `movara_server`, which owns Movara's tables; application authorization remains
   in `@movara/core`. This login has no superuser, role-creation or global RLS-bypass
   privileges. It has database/schema creation rights for Drizzle migrations.

The application login's default privileges also revoke API-role access to future
tables, sequences and functions. Run migrations and hardening as `movara_server`
so new objects have the same owner and defaults. The verified transaction pooler
is `aws-0-us-east-1.pooler.supabase.com:6543`; migrations use the direct host.
The database password is generated and stored privately; never put it in this file.

The hardening SQL intentionally gives browser API roles no access. Better Auth
sessions are not Supabase Auth JWTs. Do not add broad Supabase policies to make
the application work. See [Supabase's RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

## First owner and team access

Complete first-run setup before sharing the public URL: create Oscar's account,
then create the **CG Service Pros** organization with slug `cg-service-pros`.
Choose branding and terminology in organization settings. After the first
organization exists, account creation is invite-only.

SMTP is optional for initial setup. Until configured, distribute invitation
links manually; invitation and recap emails are not delivered.

## Agent access

The web app serves `/mcp`. Its sessions are held in process memory, so reliable
long-running agent connections require the standalone MCP server on a persistent
host. See [the MCP deployment caveat](deploy-vercel-supabase.md#4-mcp-for-agents).

## Verification

Before release, run typecheck, lint, tests and the web production build. After
deployment, verify sign-in, session cookies, organization creation, one saved
record, sign-out, and rejection of unauthenticated API access. Confirm the
production origin matches both URL environment variables and no demo data exists.
