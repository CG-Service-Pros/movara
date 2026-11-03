import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditEvents, approvals, requestLog, teams, type DbHandle } from '@movara/db'
import { MovaraError, approveApproval, declineApproval, defineCommand, execute, getTeam, listAudit, listApprovals, listTeams, teamsCreate, teamsUpdate, base, assertVersion } from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

// A tiny command usable by agents with write:todos, optionally gated.
const makeTeam = defineCommand({
  name: 'test.make_team',
  scope: 'write:todos',
  input: z.object({ name: z.string().min(2) }),
  requiresApprovalForAgents: true,
  summary: (i) => `Make team ${i.name}`,
  run: async (ctx, input) => {
    const [row] = await ctx.db.insert(teams).values({ ...base(ctx), name: input.name }).returning()
    return { data: row!, entity: { type: 'team', id: row!.id }, before: null, after: { name: row!.name } }
  },
})
const makeTeamFree = defineCommand({
  name: 'test.make_team_free',
  scope: 'write:todos',
  input: z.object({ name: z.string().min(2) }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.insert(teams).values({ ...base(ctx), name: input.name }).returning()
    return { data: row!, entity: { type: 'team', id: row!.id }, before: null, after: { name: row!.name } }
  },
})

describe('validation, roles and scopes', () => {
  it('rejects invalid input with a validation error', async () => {
    const { ctx } = await seedTestOrg(db)
    await expect(execute(ctx, makeTeamFree, { name: 'x' })).rejects.toMatchObject({ code: 'validation' })
  })

  it('denies an agent lacking the scope', async () => {
    const { addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Reader', ['read'])
    await expect(execute(agent.ctx, makeTeamFree, { name: 'Nope' })).rejects.toMatchObject({ code: 'forbidden_scope' })
  })

  it('denies a viewer writes (role check)', async () => {
    const { addPerson } = await seedTestOrg(db)
    const viewer = await addPerson('Vera Viewer', 'viewer')
    await expect(execute(viewer.ctx, makeTeamFree, { name: 'Nope' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lets an agent with the scope run an ungated command and records the agent as actor', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Writer', ['read', 'write:todos'])
    const r = await execute(agent.ctx, makeTeamFree, { name: 'Agent team' })
    expect(r.ok).toBe(true)
    const { items } = await listAudit(ctx, { command: 'test.make_team_free' })
    expect(items[0]!.actor).toMatchObject({ type: 'agent', id: agent.agentId })
    expect(items[0]!.onBehalfOf).toBe(agent.ctx.actor.onBehalfOf)
  })
})

describe('audit', () => {
  it('writes an audit row with a diff of changed fields', async () => {
    const { ctx } = await seedTestOrg(db)
    const created = await execute(ctx, teamsCreate, { name: 'Ops' })
    if (!created.ok) throw new Error('x')
    const upd = await execute(ctx, teamsUpdate, { teamId: created.data.id, name: 'Operations' })
    if (!upd.ok) throw new Error('x')
    const [ev] = await db.select().from(auditEvents).where(eq(auditEvents.id, upd.auditId))
    expect(ev).toMatchObject({ command: 'teams.update', entityType: 'team', entityId: created.data.id, orgId: ctx.orgId })
    expect(ev!.diff).toMatchObject({ before: { name: 'Ops' }, after: { name: 'Operations' } })
    expect((ev!.diff as { before: Record<string, unknown> }).before).not.toHaveProperty('createdAt')
    expect(ev!.actor).toEqual(ctx.actor)
  })
})

describe('idempotency', () => {
  it('replays the first response for the same requestId and writes once', async () => {
    const { ctx } = await seedTestOrg(db)
    const a = await execute(ctx, teamsCreate, { name: 'Once' }, { requestId: 'req-1' })
    const b = await execute(ctx, teamsCreate, { name: 'Once' }, { requestId: 'req-1' })
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(b.replayed).toBe(true)
      expect(b.auditId).toBe(a.auditId)
      expect(b.data.id).toBe(a.data.id)
    }
    const all = await listTeams(ctx)
    expect(all.filter((t) => t.name === 'Once')).toHaveLength(1)
    const logs = await db.select().from(requestLog).where(eq(requestLog.orgId, ctx.orgId))
    expect(logs).toHaveLength(1)
  })

  it('rejects reusing a requestId for a different command', async () => {
    const { ctx } = await seedTestOrg(db)
    await execute(ctx, teamsCreate, { name: 'A' }, { requestId: 'req-2' })
    await expect(execute(ctx, teamsUpdate, { teamId: (await listTeams(ctx))[0]!.id, name: 'B' }, { requestId: 'req-2' })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('does not consume the key when the command fails', async () => {
    const { ctx } = await seedTestOrg(db)
    await expect(execute(ctx, teamsUpdate, { teamId: '018f0000-0000-7000-8000-000000000000', name: 'Z' }, { requestId: 'req-3' })).rejects.toMatchObject({ code: 'not_found' })
    const logs = await db.select().from(requestLog).where(eq(requestLog.orgId, ctx.orgId))
    expect(logs).toHaveLength(0)
  })

  it('scopes request ids per org', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const ra = await execute(a.ctx, teamsCreate, { name: 'T' }, { requestId: 'shared' })
    const rb = await execute(b.ctx, teamsCreate, { name: 'T' }, { requestId: 'shared' })
    expect(ra.ok && rb.ok && !rb.replayed).toBe(true)
  })
})

describe('optimistic concurrency', () => {
  it('returns a conflict with the current state for a stale expectedVersion', async () => {
    const { ctx } = await seedTestOrg(db)
    const c = await execute(ctx, teamsCreate, { name: 'V' })
    if (!c.ok) throw new Error('x')
    expect(c.data.version).toBe(1)
    await execute(ctx, teamsUpdate, { teamId: c.data.id, name: 'V2' }, { expectedVersion: 1 })
    const err = await execute(ctx, teamsUpdate, { teamId: c.data.id, name: 'V3' }, { expectedVersion: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(MovaraError)
    expect(err.code).toBe('conflict')
    expect(err.details.current.version).toBe(2)
    expect((await getTeam(ctx, c.data.id)).name).toBe('V2')
  })

  it('assertVersion passes when undefined or equal', () => {
    expect(() => assertVersion({ version: 3 }, undefined)).not.toThrow()
    expect(() => assertVersion({ version: 3 }, 3)).not.toThrow()
    expect(() => assertVersion({ version: 3 }, 2)).toThrow(MovaraError)
  })
})

describe('agent approval gate', () => {
  it('creates an approval instead of running, then approve re-executes as the agent', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Proposer', ['read', 'write:todos'])
    const r = await execute(agent.ctx, makeTeam, { name: 'Gated team' }, { requestId: 'gate-1' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect((await listTeams(ctx)).some((t) => t.name === 'Gated team')).toBe(false)
    const pending = await listApprovals(ctx, { status: 'pending' })
    expect(pending.items.map((a) => a.id)).toContain(r.approvalId)
    expect(pending.items[0]).toMatchObject({ action: 'test.make_team', status: 'pending', summary: 'Make team Gated team' })

    // Retrying the same request returns the same approval.
    const again = await execute(agent.ctx, makeTeam, { name: 'Gated team' }, { requestId: 'gate-1' })
    expect(again.ok === false && again.approvalId === r.approvalId).toBe(true)

    // Agents cannot approve their own request.
    await expect(approveApproval(agent.ctx, r.approvalId)).rejects.toMatchObject({ code: expect.stringMatching(/forbidden/) })

    const decided = await approveApproval(ctx, r.approvalId, 'ok')
    expect(decided.ok).toBe(true)
    const team = (await listTeams(ctx)).find((t) => t.name === 'Gated team')!
    expect(team.createdByActor).toMatchObject({ type: 'agent', id: agent.agentId })

    const events = await db.select().from(auditEvents).where(eq(auditEvents.orgId, ctx.orgId))
    const created = events.find((e) => e.command === 'test.make_team')!
    expect(created.actor).toMatchObject({ type: 'agent', id: agent.agentId })
    expect(created.diff).toMatchObject({ approvalId: r.approvalId })
    expect(events.some((e) => e.command === 'approvals.decide' && (e.actor as { type: string }).type === 'person')).toBe(true)
    expect(events.some((e) => e.command === 'approval.request')).toBe(true)

    const [row] = await db.select().from(approvals).where(eq(approvals.id, r.approvalId))
    expect(row).toMatchObject({ status: 'approved', decisionNote: 'ok' })

    // Cannot decide twice.
    await expect(declineApproval(ctx, r.approvalId)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('decline leaves the system untouched', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Proposer', ['read', 'write:todos'])
    const r = await execute(agent.ctx, makeTeam, { name: 'Nope team' })
    if (r.ok) throw new Error('expected approval')
    await declineApproval(ctx, r.approvalId, 'not now')
    expect((await listTeams(ctx)).some((t) => t.name === 'Nope team')).toBe(false)
    const [row] = await db.select().from(approvals).where(eq(approvals.id, r.approvalId))
    expect(row!.status).toBe('declined')
  })

  it('admin-scoped commands always need approval for agents', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Admin agent', ['read', 'admin'], undefined)
    const r = await execute(agent.ctx, teamsCreate, { name: 'By admin agent' })
    expect(r.ok).toBe(false)
    expect((await listTeams(ctx)).some((t) => t.name === 'By admin agent')).toBe(false)
  })

  it('approval fails (and stays pending) when the agent lost the scope meanwhile', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Shrinking', ['read', 'write:todos'])
    const r = await execute(agent.ctx, makeTeam, { name: 'Late team' })
    if (r.ok) throw new Error('expected approval')
    const { agentsUpdateScopes } = await import('../src')
    await execute(ctx, agentsUpdateScopes, { agentId: agent.agentId, scopes: ['read'] })
    await expect(approveApproval(ctx, r.approvalId)).rejects.toMatchObject({ code: 'forbidden_scope' })
    const pending = await listApprovals(ctx, { status: 'pending' })
    expect(pending.items.map((a) => a.id)).toContain(r.approvalId)
  })
})

describe('cross-org isolation', () => {
  it('never reads or writes another org\'s records', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const t = await execute(a.ctx, teamsCreate, { name: 'Secret' })
    if (!t.ok) throw new Error('x')
    await expect(getTeam(b.ctx, t.data.id)).rejects.toMatchObject({ code: 'not_found' })
    expect((await listTeams(b.ctx)).some((x) => x.name === 'Secret')).toBe(false)
    await expect(execute(b.ctx, teamsUpdate, { teamId: t.data.id, name: 'Hacked' })).rejects.toMatchObject({ code: 'not_found' })
    expect((await getTeam(a.ctx, t.data.id)).name).toBe('Secret')
    const audit = await listAudit(b.ctx)
    expect(audit.items.every((e) => e.orgId === b.ctx.orgId)).toBe(true)
    const apprs = await listApprovals(b.ctx)
    expect(apprs.items).toHaveLength(0)
  })
})
