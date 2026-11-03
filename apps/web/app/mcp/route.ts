import { getDb } from '@/lib/db'
import { sharedMcpHttpHandler } from '@motion/mcp/http-handler'
import { OAUTH_ENDPOINTS } from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * MCP over streamable HTTP, same server factory as apps/mcp. Bearer auth: API keys (mk_live_…) or OAuth access tokens (mo_at_…, see /.well-known/oauth-protected-resource).
 * Sessions are kept in process memory: use a long-running Node server (not serverless) or the standalone apps/mcp server.
 */
const handle = (req: Request) => sharedMcpHttpHandler(() => getDb(), { resourceMetadataUrl: () => OAUTH_ENDPOINTS().resourceMetadata })(req)

export { handle as GET, handle as POST, handle as DELETE }
