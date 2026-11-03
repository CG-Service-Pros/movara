import { json, preflight, protectedResourceMetadata } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/** RFC 9728 discovery for the MCP endpoint (`/.well-known/oauth-protected-resource` and `…/mcp`). */
export const GET = () => json(protectedResourceMetadata())
export const OPTIONS = preflight
