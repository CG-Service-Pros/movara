# Deploy: Docker Compose (self-host)

One command brings up PostgreSQL 16, the web app, the standalone MCP server and a one-shot migration job. Files live in [`docker/`](../docker/).

| Service | Image / Dockerfile | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | none published | Data in the `motion-pgdata` volume; healthcheck `pg_isready` |
| `migrate` | [`docker/Dockerfile.web`](../docker/Dockerfile.web) | none | One-shot (builds the `builder` stage: full workspace): `pnpm db:migrate` (or `db:seed` when `MOTION_SEED_DEMO=1`), then exits |
| `web` | [`docker/Dockerfile.web`](../docker/Dockerfile.web) | 3000 | Next.js **standalone** server (`node apps/web/server.js`); healthcheck on `/sign-in`; serves `/mcp` and the OAuth endpoints too |
| `mcp` | [`docker/Dockerfile.mcp`](../docker/Dockerfile.mcp) | 3333 | Standalone MCP server; healthcheck `/healthz` |

`web` and `mcp` start after `migrate` completes successfully.

## Steps

```bash
git clone https://github.com/OscarCGPro/motion.git && cd motion
cp docker/.env.example docker/.env
# edit docker/.env: BETTER_AUTH_SECRET (openssl rand -base64 32), POSTGRES_PASSWORD, URLs
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

Open <http://localhost:3000>, click **Create an account** and complete onboarding. For a trial run with demo data, set `MOTION_SEED_DEMO=1` before the first `up` (login `demo@motion.local` / `motion-demo`, org `/vindex`). Never seed demo data into a real install.

Check status: `docker compose -f docker/docker-compose.yml ps` and `... logs -f web`.

## Configuration

All settings are in `docker/.env` (see [`docker/.env.example`](../docker/.env.example)): database credentials, `BETTER_AUTH_SECRET` (required), `BETTER_AUTH_URL` / `APP_URL` (the public URL), `WEB_PORT` / `MCP_PORT`, SMTP, `MOTION_TERMINOLOGY_PACKS`, `MOTION_SEED_DEMO`.

## Production notes

- **HTTPS:** put a reverse proxy (Caddy, Traefik, nginx) in front of `web` (and `mcp`), then set `BETTER_AUTH_URL` and `APP_URL` to the public `https://` URL.
- **MCP:** agents can use either `https://<host>/mcp` (web) or the standalone `http://<host>:3333/mcp`. Sessions are held in memory, so keep one replica of each (or use sticky routing). See [mcp-setup.md](mcp-setup.md).
- **External Postgres:** remove the `postgres` service and set `DATABASE_URL` for `migrate`, `web` and `mcp` in the compose file (the `x-app-env` block).
- **Backups:** `docker compose -f docker/docker-compose.yml exec postgres pg_dump -U motion motion > motion.sql`.
- **Upgrades:** `git pull && docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build`; the `migrate` job runs again on every `up`.
- **Next.js build mode:** `next.config.ts` sets `output: 'standalone'` with `outputFileTracingRoot` at the monorepo root. The `web` runtime image
  contains only the traced server (`apps/web/server.js`, ~75 MB incl. PGlite and postgres-js with their wasm/data files), `.next/static` and `public`; it no longer
  carries the pnpm workspace. Only the one-shot `migrate` job uses the full `builder` stage. Without Docker:
  `pnpm --filter @motion/web build && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/ && cp -r apps/web/public apps/web/.next/standalone/apps/web/ && node apps/web/.next/standalone/apps/web/server.js`
  (set `PORT`, `HOSTNAME`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, `APP_URL`, `BETTER_AUTH_URL`).
- **Postgres poolers:** if `DATABASE_URL` points at PgBouncer/Supavisor in transaction mode (port 6543, a `*.pooler.*` host or `?pgbouncer=true`), prepared statements are disabled
  automatically; override with `DATABASE_PREPARE=0|1`. Direct `postgres:5432` (the bundled service) keeps them on. Run migrations through a direct or session connection.
- **Single container with PGlite** (no Postgres, trial only): `docker run -p 3000:3000 -e DATABASE_URL=pglite:///data/pglite -e BETTER_AUTH_SECRET=… -e APP_URL=… -e BETTER_AUTH_URL=… -v motion-data:/data motion-web`.
  Use an absolute path: the server changes directory to `apps/web`.
- **Server actions / proxies:** `next.config.ts` bakes `serverActions.allowedOrigins` (from `APP_URL`/`BETTER_AUTH_URL`) and the security headers (CSP, HSTS) at **build** time. Behind a reverse proxy that rewrites `Host`, pass `APP_URL` as a build arg/env when building the image; otherwise Next's default same-origin check applies.
- **MCP OAuth:** `APP_URL` must be the public `https://` URL; MCP clients discover the OAuth endpoints from it ([mcp-setup.md](mcp-setup.md)).
  Route `/.well-known/*`, `/oauth/*`, `/api/auth/*` and `/mcp` to `web`.

## Build the images by hand

```bash
docker build -f docker/Dockerfile.web -t motion-web .
docker build -f docker/Dockerfile.mcp -t motion-mcp .
```

Both build from the repository root and need BuildKit (the default in current Docker).
