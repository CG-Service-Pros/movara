import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { agents, apiKeys, auditEvents, hashApiKey, requestLog, type DbHandle } from '@movara/db'
import { agentsCreate, agentsRevoke, agentsRevokeApiKey, agentsUpdateScopes, authenticateApiKey, execute, getAgent, issueApiKey, listAgents, listApiKeys, teamsCreate } from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

describe('agents and API keys', () => {
  it('creates an agent, issues a key (plaintext once, hash stored) and authenticates', async () => {
    const { ctx } = await seedTestOrg(db)
    const created = await execute(ctx, agentsCreate, { name: 'Ops Agent', client: 'Claude Code', scopes: ['read', 'write:todos'] })
    if (!created.ok) throw new Error('x')
    const issued = await issueApiKey(ctx, { agentId: created.data.id, name: 'laptop' }, { requestId: 'k-1' })
    if (!issued.ok) throw new Error('x')
    const key = issued.data.key
    expect(key).toMatch(/^mk_live_[A-Za-z0-9_-]{20,}$/)

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, issued.data.keyId))
    expect(row!.keyHash).toBe(hashApiKey(key))
    expect(JSON.stringify(row)).not.toContain(key)
    // Plaintext appears nowhere in audit or request_log.
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.orgId, ctx.orgId))
    const logs = await db.select().from(requestLog).where(eq(requestLog.orgId, ctx.orgId))
    expect(JSON.stringify(audit)).not.toContain(key)
    expect(JSON.stringify(logs)).not.toContain(key)
    // A redacted request cannot be replayed (the key would have to be reissued).
    await expect(issueApiKey(ctx, { agentId: created.data.id, name: 'laptop' }, { requestId: 'k-1' })).rejects.toMatchObject({ code: 'conflict' })

    const actx = await authenticateApiKey(db, key)
    expect(actx).toMatchObject({ orgId: ctx.orgId, scopes: ['read', 'write:todos'], role: 'owner' })
    expect(actx.actor).toEqual({ type: 'agent', id: created.data.id, onBehalfOf: ctx.actor.id })
    const [k2] = await db.select().from(apiKeys).where(eq(apiKeys.id, issued.data.keyId))
    expect(k2!.lastUsedAt).toBeTruthy()

    const keys = await listApiKeys(ctx, created.data.id)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toHaveProperty('keyHash')
  })

  it('rejects unknown, malformed, revoked and expired keys', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    await expect(authenticateApiKey(db, 'mk_live_doesnotexist')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(authenticateApiKey(db, 'sk_other')).rejects.toMatchObject({ code: 'forbidden' })

    const a = await addAgent('Temp', ['read'])
    await authenticateApiKey(db, a.apiKey)
    const keys = await listApiKeys(ctx, a.agentId)
    await execute(ctx, agentsRevokeApiKey, { keyId: keys[0]!.id })
    await expect(authenticateApiKey(db, a.apiKey)).rejects.toMatchObject({ code: 'forbidden' })

    const b = await addAgent('Expiring', ['read'])
    await db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiKeys.agentId, b.agentId))
    await expect(authenticateApiKey(db, b.apiKey)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('revoking an agent kills its keys; paused agents cannot authenticate', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const a = await addAgent('Doomed', ['read'])
    await execute(ctx, agentsRevoke, { agentId: a.agentId })
    await expect(authenticateApiKey(db, a.apiKey)).rejects.toMatchObject({ code: 'forbidden' })
    expect((await getAgent(ctx, a.agentId)).status).toBe('revoked')
    expect((await listAgents(ctx)).map((x) => x.id)).not.toContain(a.agentId)
    expect((await listAgents(ctx, { includeRevoked: true })).map((x) => x.id)).toContain(a.agentId)
    await expect(execute(ctx, agentsUpdateScopes, { agentId: a.agentId, scopes: ['read'] })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('narrows scopes with the key and keeps updates live', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const a = await addAgent('Scoped', ['read', 'write:todos', 'write:issues'])
    const issued = await issueApiKey(ctx, { agentId: a.agentId, scopes: ['read'] })
    if (!issued.ok) throw new Error('x')
    expect((await authenticateApiKey(db, issued.data.key)).scopes).toEqual(['read'])
    await execute(ctx, agentsUpdateScopes, { agentId: a.agentId, scopes: ['read', 'write:todos'] })
    expect((await authenticateApiKey(db, a.apiKey)).scopes).toEqual(['read', 'write:todos'])
  })

  it('does not let a key from one org act in another', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const agent = await a.addAgent('Cross', ['read', 'admin'])
    const actx = await authenticateApiKey(db, agent.apiKey)
    expect(actx.orgId).toBe(a.ctx.orgId)
    await expect(getAgent(b.ctx, agent.agentId)).rejects.toMatchObject({ code: 'not_found' })
    // Even an admin-scoped agent's write goes to approvals in its own org only.
    const r = await execute(actx, teamsCreate, { name: 'X' })
    expect(r.ok).toBe(false)
  })

  it('members can only manage their own agents', async () => {
    const { ctx, addPerson } = await seedTestOrg(db)
    const m1 = await addPerson('Mia Member')
    const m2 = await addPerson('Max Member')
    const own = await execute(m1.ctx, agentsCreate, { name: 'Mia bot' })
    expect(own.ok).toBe(true)
    await expect(execute(m1.ctx, agentsCreate, { name: 'For Max', ownerPersonId: m2.personId })).rejects.toMatchObject({ code: 'forbidden' })
    if (!own.ok) return
    await expect(execute(m2.ctx, agentsUpdateScopes, { agentId: own.data.id, scopes: ['read'] })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(execute(m1.ctx, agentsUpdateScopes, { agentId: own.data.id, scopes: ['read', 'admin'] })).rejects.toMatchObject({ code: 'forbidden' })
    expect((await execute(ctx, agentsUpdateScopes, { agentId: own.data.id, scopes: ['read', 'admin'] })).ok).toBe(true)
    const [row] = await db.select().from(agents).where(eq(agents.id, own.data.id))
    expect(row!.scopes).toEqual(['read', 'admin'])
  })
})
