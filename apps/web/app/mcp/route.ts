import { getDb } from '@/lib/db'
import { sharedMcpHttpHandler } from '@motion/mcp/http-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * MCP over streamable HTTP, same server factory as apps/mcp. Bearer API key auth (mk_live_…).
 * Sessions are kept in process memory: use a long-running Node server (not serverless) or the standalone apps/mcp server.
 */
const handle = (req: Request) => sharedMcpHttpHandler(() => getDb())(req)

export { handle as GET, handle as POST, handle as DELETE }
