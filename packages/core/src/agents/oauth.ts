import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { agents, newId, oauthClients, oauthCodes, oauthTokens, hashApiKey, type Db } from '@movara/db'
import { ctxForAgent, hasRole, isScopePreset, SCOPES, type Ctx, type Scope, type ScopePreset } from '../ctx'
import { MovaraError } from '../errors'
import { execute } from '../runner'
import { agentsCreate, agentsUpdateScopes } from './commands'

/**
 * OAuth 2.1 authorization server for MCP clients (authorization code + PKCE S256, dynamic client registration,
 * refresh-token rotation). Every access token belongs to a Movara agent record, so scopes, approvals, audit and
 * revocation work exactly like they do for API keys. Tokens and codes are stored as sha256 hashes.
 */

export const ACCESS_TOKEN_PREFIX = 'mo_at_'
export const REFRESH_TOKEN_PREFIX = 'mo_rt_'
export const ACCESS_TOKEN_TTL_S = 60 * 60
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 30
export const AUTH_CODE_TTL_S = 10 * 60

/** RFC 6749 error. `status` is the HTTP status the token/registration endpoint should answer with. */
export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
    this.name = 'OAuthError'
  }
}
export const isOAuthError = (e: unknown): e is OAuthError => e instanceof OAuthError

const sha = hashApiKey
const newSecret = (prefix: string) => prefix + randomBytes(32).toString('base64url')
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export type OAuthClientRow = typeof oauthClients.$inferSelect

/** http(s) (http only on loopback) or a custom app scheme (cursor://, claude://). Never javascript:/data:/file:. */
export function isValidRedirectUri(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.hash) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  return !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:'].includes(u.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(u.protocol)
}

/** Keep only known Movara scopes; default to read-only. */
export function parseScopes(raw: string | string[] | undefined | null): Scope[] {
  const list = Array.isArray(raw) ? raw : (raw ?? '').split(/[\s,]+/).filter(Boolean)
  const known = [...new Set(list)].filter((s): s is Scope => (SCOPES as readonly string[]).includes(s))
  return known.length ? known : ['read']
}

// ---------------------------------------------------------------- dynamic client registration (RFC 7591)

export async function registerOAuthClient(db: Db, meta: Record<string, unknown>) {
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.filter((u): u is string => typeof u === 'string') : []
  if (!redirectUris.length || redirectUris.length !== (meta.redirect_uris as unknown[]).length || redirectUris.length > 10 || !redirectUris.every(isValidRedirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be 1-10 https URLs (http only for localhost) or app-scheme URIs')
  }
  const method = typeof meta.token_endpoint_auth_method === 'string' ? meta.token_endpoint_auth_method : 'none'
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
    throw new OAuthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method')
  }
  const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types.map(String) : ['authorization_code', 'refresh_token']
  if (!grantTypes.every((g) => ['authorization_code', 'refresh_token'].includes(g))) {
    throw new OAuthError('invalid_client_metadata', 'Only the authorization_code and refresh_token grants are supported')
  }
  const name = (typeof meta.client_name === 'string' && meta.client_name.trim() ? meta.client_name.trim() : 'MCP client').slice(0, 80)
  const clientId = 'mc_' + randomBytes(18).toString('base64url')
  const secret = method === 'none' ? null : newSecret('mcs_')
  const scopes = parseScopes(typeof meta.scope === 'string' ? meta.scope : undefined)
  const issuedAt = new Date()
  await db.insert(oauthClients).values({
    id: newId(),
    orgId: null,
    clientId,
    clientSecretHash: secret ? sha(secret) : null,
    name,
    redirectUris,
    scopes,
    metadata: { token_endpoint_auth_method: method, grant_types: grantTypes, client_uri: typeof meta.client_uri === 'string' ? meta.client_uri.slice(0, 300) : undefined },
  })
  return {
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
    scope: scopes.join(' '),
  }
}

export async function getOAuthClient(db: Db, clientId: string): Promise<OAuthClientRow | null> {
  const [c] = await db.select().from(oauthClients).where(and(eq(oauthClients.clientId, clientId), isNull(oauthClients.deletedAt))).limit(1)
  return c ?? null
}

async function authenticateClient(db: Db, clientId: string, secret: string | null | undefined): Promise<OAuthClientRow> {
  const c = await getOAuthClient(db, clientId)
  if (!c) throw new OAuthError('invalid_client', 'Unknown client', 401)
  if (c.clientSecretHash) {
    if (!secret || !safeEqual(sha(secret), c.clientSecretHash)) throw new OAuthError('invalid_client', 'Bad client credentials', 401)
  }
  return c
}

// ---------------------------------------------------------------- consent -> authorization code

/** The agent that represents (client, person, org). Created on first consent, reused (and re-scoped) afterwards. */
async function agentForConsent(ctx: Ctx, client: OAuthClientRow, scopes: Scope[], preset?: ScopePreset) {
  const personId = ctx.actor.id
  const [existing] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, ctx.orgId), eq(agents.oauthClientId, client.clientId), eq(agents.ownerPersonId, personId), isNull(agents.deletedAt)))
  // Reuse an active/paused agent; a revoked one stays revoked and a fresh agent is created.
  const live = existing && existing.status !== 'revoked' ? existing : null
  if (live) {
    const same = live.scopes.length === scopes.length && scopes.every((s) => live.scopes.includes(s))
    if (!same) await execute(ctx, agentsUpdateScopes, { agentId: live.id, scopes, preset })
    if (live.status === 'paused') throw new MovaraError('conflict', 'This connection is paused in Settings -> Agents; resume it first')
    return live.id
  }
  const created = await execute(ctx, agentsCreate, { name: client.name, client: `${client.name} · OAuth`, scopes, preset })
  if (!created.ok) throw new MovaraError('needs_approval', 'Creating this agent needs approval')
  await ctx.db.update(agents).set({ oauthClientId: client.clientId }).where(eq(agents.id, created.data.id))
  return created.data.id
}

/**
 * The signed-in person approved: create/reuse the agent, mint a single-use code bound to client, redirect_uri and
 * PKCE challenge. `ctx` is the person's ctx in the org they picked. Returns the code to put in the redirect.
 */
export async function approveAuthorization(
  ctx: Ctx,
  input: { clientId: string; redirectUri: string; codeChallenge: string; scopes: string[]; /** Consent-screen preset the scopes came from (stored on the agent). */ preset?: string },
): Promise<string> {
  if (ctx.actor.type !== 'person') throw new MovaraError('forbidden', 'Only a person can approve a connection')
  const client = await getOAuthClient(ctx.db, input.clientId)
  if (!client) throw new MovaraError('not_found', 'Unknown client')
  if (!client.redirectUris.includes(input.redirectUri)) throw new MovaraError('validation', 'redirect_uri is not registered for this client')
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) throw new MovaraError('validation', 'Invalid PKCE code_challenge')
  const scopes = parseScopes(input.scopes)
  if (scopes.includes('admin') && !hasRole(ctx, 'admin')) throw new MovaraError('forbidden', "Only an admin can grant the 'admin' scope")
  const agentId = await agentForConsent(ctx, client, scopes, isScopePreset(input.preset) ? input.preset : undefined)
  const code = newSecret('mo_ac_')
  await ctx.db.insert(oauthCodes).values({
    id: newId(),
    orgId: ctx.orgId,
    agentId,
    clientId: client.clientId,
    codeHash: sha(code),
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_S * 1000),
  })
  return code
}

// ---------------------------------------------------------------- token endpoint

export type TokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

async function mintTokens(db: Db, p: { orgId: string; agentId: string; clientId: string; scopes: string[] }): Promise<TokenResponse> {
  const access = newSecret(ACCESS_TOKEN_PREFIX)
  const refresh = newSecret(REFRESH_TOKEN_PREFIX)
  const now = Date.now()
  await db.insert(oauthTokens).values([
    { id: newId(), orgId: p.orgId, agentId: p.agentId, clientId: p.clientId, tokenHash: sha(access), kind: 'access', scopes: p.scopes, expiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000) },
    { id: newId(), orgId: p.orgId, agentId: p.agentId, clientId: p.clientId, tokenHash: sha(refresh), kind: 'refresh', scopes: p.scopes, expiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000) },
  ])
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope: p.scopes.join(' ') }
}

const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export async function exchangeAuthorizationCode(
  db: Db,
  input: { clientId: string; clientSecret?: string | null; code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenResponse> {
  const client = await authenticateClient(db, input.clientId, input.clientSecret)
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) throw new OAuthError('invalid_grant', 'Invalid code_verifier')
  // Claim the code atomically so it can only ever be redeemed once.
  const [row] = await db
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthCodes.codeHash, sha(input.code)), isNull(oauthCodes.usedAt)))
    .returning()
  if (!row || row.clientId !== client.clientId || row.expiresAt.getTime() < Date.now()) throw new OAuthError('invalid_grant', 'Invalid, expired or already used code')
  if (row.redirectUri !== input.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch')
  if (!safeEqual(pkceChallenge(input.codeVerifier), row.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed')
  return mintTokens(db, { orgId: row.orgId, agentId: row.agentId, clientId: row.clientId, scopes: row.scopes })
}

export async function refreshOAuthToken(db: Db, input: { clientId: string; clientSecret?: string | null; refreshToken: string }): Promise<TokenResponse> {
  const client = await authenticateClient(db, input.clientId, input.clientSecret)
  const hash = sha(input.refreshToken)
  // Rotation: a refresh token works once; the replacement pair is issued below.
  const [row] = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.tokenHash, hash), eq(oauthTokens.kind, 'refresh'), isNull(oauthTokens.revokedAt)))
    .returning()
  if (!row || row.clientId !== client.clientId || (row.expiresAt && row.expiresAt.getTime() < Date.now())) throw new OAuthError('invalid_grant', 'Invalid or expired refresh token')
  if (!row.agentId) throw new OAuthError('invalid_grant', 'Token is not bound to an agent')
  const [a] = await db.select({ status: agents.status }).from(agents).where(eq(agents.id, row.agentId)).limit(1)
  if (!a || a.status !== 'active') throw new OAuthError('invalid_grant', 'The agent behind this connection is no longer active')
  return mintTokens(db, { orgId: row.orgId, agentId: row.agentId, clientId: row.clientId, scopes: row.scopes })
}

// ---------------------------------------------------------------- resource server side

/** Resolve a `mo_at_…` access token to the agent's Ctx. Throws `forbidden` for unknown/expired/revoked tokens or agents. */
export async function authenticateOAuthToken(db: Db, token: string): Promise<Ctx> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) throw new MovaraError('forbidden', 'Not an OAuth access token')
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.tokenHash, sha(token)), eq(oauthTokens.kind, 'access'), isNull(oauthTokens.deletedAt)))
    .limit(1)
  if (!row || row.revokedAt || !row.agentId) throw new MovaraError('forbidden', 'Invalid or revoked access token')
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) throw new MovaraError('forbidden', 'Access token expired')
  const ctx = await ctxForAgent(db, row.orgId, row.agentId, row.scopes) // denies paused/revoked agents
  await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, row.agentId))
  return ctx
}

/** Revoke every OAuth token (and unused code) of an agent. Called when the agent is revoked. */
export async function revokeAgentOAuthTokens(db: Db, orgId: string, agentId: string): Promise<void> {
  const now = new Date()
  await db.update(oauthTokens).set({ revokedAt: now }).where(and(eq(oauthTokens.orgId, orgId), eq(oauthTokens.agentId, agentId), isNull(oauthTokens.revokedAt)))
  await db.update(oauthCodes).set({ usedAt: now }).where(and(eq(oauthCodes.orgId, orgId), eq(oauthCodes.agentId, agentId), isNull(oauthCodes.usedAt)))
}
