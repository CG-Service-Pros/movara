# Motion (working name)

An open-source, agent-first operating system for running a company on a quarterly rhythm:
vision, quarterly priorities, a weekly scorecard, issues, to-dos and a weekly meeting.
Every action is available to AI agents through an MCP server. The app is white-label:
your logo, colors and terminology.

- `docs/design-plan.md`: design principles, visual system, IA, key screens
- `design/stageshow/`: interactive mockups (`npm install && npm run dev`, or `./restart-preview.sh` for :5199)
- `research/`: private competitive notes (gitignored, never publish)

Planned stack: Next.js · Tailwind/Radix · Postgres (Supabase) · MCP server (TypeScript SDK) · deploy on Vercel or Docker Compose.
