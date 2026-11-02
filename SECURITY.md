# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email **oscar@vindexconsulting.com** with:

- a description of the issue and its impact
- steps to reproduce or a proof of concept
- the affected version or commit, and your deployment type (Docker, Vercel, local)

You can also use GitHub's private vulnerability reporting ("Security" tab -> "Report a vulnerability") on the repository.

We aim to acknowledge reports within 3 business days and to share a plan or fix timeline within 10 business days. We will credit you in the release notes unless you prefer otherwise. Please give us a reasonable time to release a fix before disclosing publicly.

## Supported versions

Motion is pre-1.0. Security fixes are applied to the latest release on `main` only.

## Scope notes for operators

- Set a strong `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and never commit `.env` files.
- The seeded demo data (`demo@motion.local` / `motion-demo` and the demo API key `mk_live_demo_ops_agent_0000000000000000`) is for development only. Do not seed it into a production database (`MOTION_SEED_DEMO=0`).
- Agent API keys (`mk_live_...`) are bearer credentials: issue them with the narrowest scopes, rotate and revoke them in Settings -> Agents.
- Terminology packs are validated data and never execute code, but review the content of packs you import from untrusted URLs.
- Run behind HTTPS and set `BETTER_AUTH_URL` / `APP_URL` to your public URL.
