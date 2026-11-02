# Deploy: Docker Compose (self-host)

One command brings up PostgreSQL 16, the web app, the standalone MCP server and a one-shot migration job. Files live in [`docker/`](../docker/).

| Service | Image / Dockerfile | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | none published | Data in the `motion-pgdata` volume; healthcheck `pg_isready` |
| `migrate` | [`docker/Dockerfile.web`](../docker/Dockerfile.web) | none | One-shot: `pnpm db:migrate` (or `db:seed` when `MOTION_SEED_DEMO=1`), then exits |
| `web` | [`docker/Dockerfile.web`](../docker/Dockerfile.web) | 3000 | Next.js (`next start`); healthcheck on `/sign-in`; serves `/mcp` too |
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
- **Next.js build mode:** `next.config.ts` does not enable `output: 'standalone'`, so the image runs `next start` on a pruned monorepo (`turbo prune`) and is larger than a standalone image.

## Build the images by hand

```bash
docker build -f docker/Dockerfile.web -t motion-web .
docker build -f docker/Dockerfile.mcp -t motion-mcp .
```

Both build from the repository root and need BuildKit (the default in current Docker).
