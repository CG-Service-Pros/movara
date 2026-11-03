import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { authenticateApiKey } from '@movara/core'
import { createDb, migrate } from '@movara/db'
import { createMovaraMcpServer } from './server'

/** stdio MCP server for local clients. Env: MOVARA_API_KEY (required), DATABASE_URL. Logs go to stderr only. */
async function main() {
  const key = process.env.MOVARA_API_KEY
  if (!key) {
    console.error('MOVARA_API_KEY is required (create an agent key in Settings > Agents)')
    process.exit(1)
  }
  const db = createDb(process.env.DATABASE_URL)
  await migrate(db)
  const ctx = await authenticateApiKey(db, key)
  const server = await createMovaraMcpServer({ db, resolveCtx: () => ctx })
  await server.connect(new StdioServerTransport())
  console.error(`[movara-mcp] stdio ready as ${ctx.actor.type} ${ctx.actor.id}`)
  const done = () => void db.$close().finally(() => process.exit(0))
  process.stdin.on('close', done)
  process.on('SIGINT', done)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
