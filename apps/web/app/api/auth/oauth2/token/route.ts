import { exchangeAuthorizationCode, isOAuthError, OAuthError, refreshOAuthToken } from '@motion/core'
import { getDb } from '@/lib/db'
import { json, preflight } from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Token endpoint: authorization_code (+PKCE) and refresh_token grants. Public clients send no secret. */
export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') ?? ''
    const raw: Record<string, unknown> = ct.includes('json') ? await req.json().catch(() => ({})) : Object.fromEntries(await req.formData().then((f) => [...f.entries()]).catch(() => []))
    const p = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : undefined)

    let clientId = p('client_id')
    let clientSecret = p('client_secret')
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
    if (basic) {
      const [id, ...rest] = Buffer.from(basic[1]!, 'base64').toString().split(':')
      clientId = decodeURIComponent(id ?? '')
      clientSecret = decodeURIComponent(rest.join(':'))
    }
    if (!clientId) throw new OAuthError('invalid_client', 'client_id is required', 401)

    const db = await getDb()
    const grant = p('grant_type')
    if (grant === 'authorization_code') {
      if (!p('code') || !p('code_verifier') || !p('redirect_uri')) throw new OAuthError('invalid_request', 'code, code_verifier and redirect_uri are required')
      return json(await exchangeAuthorizationCode(db, { clientId, clientSecret, code: p('code')!, codeVerifier: p('code_verifier')!, redirectUri: p('redirect_uri')! }))
    }
    if (grant === 'refresh_token') {
      if (!p('refresh_token')) throw new OAuthError('invalid_request', 'refresh_token is required')
      return json(await refreshOAuthToken(db, { clientId, clientSecret, refreshToken: p('refresh_token')! }))
    }
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token')
  } catch (e) {
    if (isOAuthError(e)) return json({ error: e.code, error_description: e.message }, e.status)
    throw e
  }
}
export const OPTIONS = preflight
