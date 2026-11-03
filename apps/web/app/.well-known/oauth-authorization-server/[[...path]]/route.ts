import { authorizationServerMetadata, json, preflight } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/** RFC 8414 discovery. Also answers the path-suffixed form (`…/oauth-authorization-server/mcp`) some clients try. */
export const GET = () => json(authorizationServerMetadata())
export const OPTIONS = preflight
