import { isOAuthError, registerOAuthClient } from '@movara/core'
import { getDb } from '@/lib/db'
import { json, preflight } from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** RFC 7591 dynamic client registration (open, like most MCP servers; clients get no access until a person consents). */
export async function POST(req: Request) {
  const meta = await req.json().catch(() => null)
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return json({ error: 'invalid_client_metadata', error_description: 'Send a JSON object' }, 400)
  try {
    return json(await registerOAuthClient(await getDb(), meta as Record<string, unknown>), 201)
  } catch (e) {
    if (isOAuthError(e)) return json({ error: e.code, error_description: e.message }, e.status)
    throw e
  }
}
export const OPTIONS = preflight
