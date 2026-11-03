import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { agents, oauthTokens, type DbHandle } from '@movara/db'
import {
  agentsRevoke, agentsUpdate, approveAuthorization, authenticateOAuthToken, exchangeAuthorizationCode, execute, isValidRedirectUri,
  refreshOAuthToken, registerOAuthClient,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
const REDIRECT = 'http://localhost:6274/callback'

async function connectClient(scopes = ['read', 'write:todos']) {
  const o = await seedTestOrg(db)
  const reg = await registerOAuthClient(db, { client_name: 'Claude Desktop', redirect_uris: [REDIRECT] })
  const p = pkce()
  const code = await approveAuthorization(o.ctx, { clientId: reg.client_id, redirectUri: REDIRECT, codeChallenge: p.challenge, scopes })
  const tokens = await exchangeAuthorizationCode(db, { clientId: reg.client_id, code, codeVerifier: p.verifier, redirectUri: REDIRECT })
  return { ...o, reg, p, code, tokens }
}

describe('OAuth for MCP clients', () => {
  it('validates redirect URIs and client metadata at registration', async () => {
    expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isValidRedirectUri('http://127.0.0.1:3000/cb')).toBe(true)
    expect(isValidRedirectUri('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true)
    expect(isValidRedirectUri('http://evil.example/cb')).toBe(false)
    expect(isValidRedirectUri('javascript:alert(1)')).toBe(false)
    await expect(registerOAuthClient(db, { redirect_uris: [] })).rejects.toMatchObject({ code: 'invalid_redirect_uri' })
    await expect(registerOAuthClient(db, { redirect_uris: [REDIRECT], grant_types: ['password'] })).rejects.toMatchObject({ code: 'invalid_client_metadata' })
    const confidential = await registerOAuthClient(db, { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_post' })
    expect(confidential.client_secret).toMatch(/^mcs_/)
  })

  it('maps an access token to the consenting person\'s agent ctx (scopes chosen at consent)', async () => {
    const { ctx, org, tokens, reg } = await connectClient()
    expect(tokens.access_token).toMatch(/^mo_at_/)
    const actx = await authenticateOAuthToken(db, tokens.access_token)
    expect(actx.orgId).toBe(org.id)
    expect(actx.scopes).toEqual(['read', 'write:todos'])
    expect(actx.actor).toMatchObject({ type: 'agent', onBehalfOf: ctx.actor.id })
    const [agent] = await db.select().from(agents).where(eq(agents.id, actx.actor.id))
    expect(agent).toMatchObject({ name: 'Claude Desktop', client: 'Claude Desktop · OAuth', oauthClientId: reg.client_id, ownerPersonId: ctx.actor.id, status: 'active' })
    expect(agent!.lastSeenAt).toBeTruthy()
    expect(JSON.stringify(await db.select().from(oauthTokens))).not.toContain(tokens.access_token)
  })

  it('reuses the agent on a second consent and applies the new scopes', async () => {
    const { ctx, reg, tokens } = await connectClient(['read'])
    const first = (await authenticateOAuthToken(db, tokens.access_token)).actor.id
    const p = pkce()
    const code = await approveAuthorization(ctx, { clientId: reg.client_id, redirectUri: REDIRECT, codeChallenge: p.challenge, scopes: ['read', 'write:issues'] })
    const t2 = await exchangeAuthorizationCode(db, { clientId: reg.client_id, code, codeVerifier: p.verifier, redirectUri: REDIRECT })
    const c2 = await authenticateOAuthToken(db, t2.access_token)
    expect(c2.actor.id).toBe(first)
    expect(c2.scopes).toEqual(['read', 'write:issues'])
  })

  it('codes are single use and bound to PKCE, redirect_uri and client', async () => {
    const { reg, p, code, ctx } = await connectClient()
    await expect(exchangeAuthorizationCode(db, { clientId: reg.client_id, code, codeVerifier: p.verifier, redirectUri: REDIRECT })).rejects.toMatchObject({ code: 'invalid_grant' })
    const mk = () => approveAuthorization(ctx, { clientId: reg.client_id, redirectUri: REDIRECT, codeChallenge: p.challenge, scopes: ['read'] })
    await expect(exchangeAuthorizationCode(db, { clientId: reg.client_id, code: await mk(), codeVerifier: pkce().verifier, redirectUri: REDIRECT })).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(exchangeAuthorizationCode(db, { clientId: reg.client_id, code: await mk(), codeVerifier: p.verifier, redirectUri: 'http://localhost:1/other' })).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(approveAuthorization(ctx, { clientId: reg.client_id, redirectUri: 'http://localhost:1/other', codeChallenge: p.challenge, scopes: ['read'] })).rejects.toMatchObject({ code: 'validation' })
    await expect(exchangeAuthorizationCode(db, { clientId: 'mc_nope', code: 'x', codeVerifier: p.verifier, redirectUri: REDIRECT })).rejects.toMatchObject({ code: 'invalid_client' })
  })

  it('rotates refresh tokens', async () => {
    const { reg, tokens } = await connectClient()
    const t2 = await refreshOAuthToken(db, { clientId: reg.client_id, refreshToken: tokens.refresh_token })
    await authenticateOAuthToken(db, t2.access_token)
    await expect(refreshOAuthToken(db, { clientId: reg.client_id, refreshToken: tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('denies expired tokens, paused agents and revoked agents (tokens revoked with the agent)', async () => {
    const { ctx, reg, tokens } = await connectClient()
    const agentId = (await authenticateOAuthToken(db, tokens.access_token)).actor.id

    await execute(ctx, agentsUpdate, { agentId, status: 'paused' })
    await expect(authenticateOAuthToken(db, tokens.access_token)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(refreshOAuthToken(db, { clientId: reg.client_id, refreshToken: tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' })
    await execute(ctx, agentsUpdate, { agentId, status: 'active' })
    await authenticateOAuthToken(db, tokens.access_token)

    await db.update(oauthTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(oauthTokens.tokenHash, createHash('sha256').update(tokens.access_token).digest('hex')))
    await expect(authenticateOAuthToken(db, tokens.access_token)).rejects.toMatchObject({ code: 'forbidden' })

    const fresh = await connectClient()
    const fa = (await authenticateOAuthToken(db, fresh.tokens.access_token)).actor.id
    await execute(fresh.ctx, agentsRevoke, { agentId: fa })
    await expect(authenticateOAuthToken(db, fresh.tokens.access_token)).rejects.toMatchObject({ code: 'forbidden' })
    const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.agentId, fa))
    expect(rows.length).toBe(2)
    expect(rows.every((r) => r.revokedAt)).toBe(true)
    await expect(refreshOAuthToken(db, { clientId: fresh.reg.client_id, refreshToken: fresh.tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' })
    // Consenting again after revocation creates a new agent.
    const p = pkce()
    const code = await approveAuthorization(fresh.ctx, { clientId: fresh.reg.client_id, redirectUri: REDIRECT, codeChallenge: p.challenge, scopes: ['read'] })
    const t = await exchangeAuthorizationCode(db, { clientId: fresh.reg.client_id, code, codeVerifier: p.verifier, redirectUri: REDIRECT })
    expect((await authenticateOAuthToken(db, t.access_token)).actor.id).not.toBe(fa)
  })

  it('rejects API keys and garbage', async () => {
    await expect(authenticateOAuthToken(db, 'mk_live_x')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(authenticateOAuthToken(db, 'mo_at_nope')).rejects.toMatchObject({ code: 'forbidden' })
  })
})
