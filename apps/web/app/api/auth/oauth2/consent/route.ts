import { approveAuthorization, ctxForUser, getOAuthClient, isMovaraError, parseScopes } from '@movara/core'
import { getDb } from '@/lib/db'
import { appUrl } from '@/lib/oauth'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const back = (redirectUri: string, params: Record<string, string | undefined>) => {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  // 303 so the browser follows with GET, including to custom app schemes (cursor://, claude://).
  return new Response(null, { status: 303, headers: { location: u.toString(), 'cache-control': 'no-store' } })
}
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } })

/** Receives the consent form of /oauth/authorize: approve (creates/reuses the agent, mints a code) or deny. */
export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(appUrl()).origin) return fail(403, 'Cross-origin consent is not allowed')
  const session = await getSession()
  if (!session) return fail(401, 'Sign in first')

  const f = await req.formData()
  const s = (k: string) => String(f.get(k) ?? '')
  const db = await getDb()
  const client = await getOAuthClient(db, s('client_id'))
  const redirectUri = s('redirect_uri')
  if (!client || !client.redirectUris.includes(redirectUri)) return fail(400, 'Unknown client or redirect_uri')
  const state = s('state') || undefined

  if (s('decision') !== 'approve') return back(redirectUri, { error: 'access_denied', error_description: 'The user denied the request', state })

  const ctx = await ctxForUser(db, { id: s('org') }, session.user.id)
  if (!ctx) return fail(403, 'You are not a member of that organization')
  try {
    const code = await approveAuthorization(ctx, {
      clientId: client.clientId,
      redirectUri,
      codeChallenge: s('code_challenge'),
      scopes: parseScopes(f.getAll('scope').map(String)),
    })
    return back(redirectUri, { code, state })
  } catch (e) {
    if (isMovaraError(e)) return back(redirectUri, { error: e.code === 'forbidden' ? 'access_denied' : 'invalid_request', error_description: e.message, state })
    throw e
  }
}
