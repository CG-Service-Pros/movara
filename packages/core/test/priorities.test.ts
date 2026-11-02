import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@motion/db'
import {
  currentQuarter, execute, getOrg, getPriority, listAudit, listPriorities, listTeams, milestoneAdd, milestoneDelete, milestoneReorder, milestoneToggle, milestoneUpdate,
  priorityCascade, priorityCreate, priorityDelete, priorityReorder, prioritySetStatus, prioritiesSummary, priorityUpdate, approveApproval,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}

describe('priorities', () => {
  it('creates with defaults (current quarter, acting owner) and milestones, lists, filters and gets', async () => {
    const t = await seedTestOrg(db)
    const q = currentQuarter(await getOrg(t.ctx))
    const p = ok(await execute(t.ctx, priorityCreate, { title: 'Ship v1', milestones: [{ title: 'Spec' }, { title: 'Build', dueDate: '2026-12-01' }] }))
    expect(p).toMatchObject({ quarter: q, ownerId: t.ctx.actor.id, status: 'on_track', level: 'company' })
    const other = ok(await execute(t.ctx, priorityCreate, { title: 'Other', quarter: '2020-Q1', level: 'individual' }))
    const list = await listPriorities(t.ctx)
    expect(list.map((x) => x.title)).toEqual(['Ship v1'])
    expect(list[0]).toMatchObject({ milestonesTotal: 2, milestonesDone: 0 })
    expect((await listPriorities(t.ctx, { quarter: '2020-Q1', level: 'individual' }))[0]!.id).toBe(other.id)
    expect(await listPriorities(t.ctx, { status: 'done' })).toEqual([])
    expect(await listPriorities(t.ctx, { ownerId: t.ctx.actor.id })).toHaveLength(1)
    const got = await getPriority(t.ctx, p.id)
    expect(got.milestones.map((m) => m.title)).toEqual(['Spec', 'Build'])
    await expect(execute(t.ctx, priorityCreate, { title: '' })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, priorityCreate, { title: 'x', quarter: '2026Q4' })).rejects.toMatchObject({ code: 'validation' })
  })

  it('updates, sets status, reorders, audits', async () => {
    const t = await seedTestOrg(db)
    const a = ok(await execute(t.ctx, priorityCreate, { title: 'A' }))
    const b = ok(await execute(t.ctx, priorityCreate, { title: 'B' }))
    await execute(t.ctx, priorityUpdate, { priorityId: a.id, title: 'A2', dueDate: '2026-12-31' })
    for (const status of ['off_track', 'done', 'not_done', 'dropped'] as const) {
      expect(ok(await execute(t.ctx, prioritySetStatus, { priorityId: a.id, status })).status).toBe(status)
    }
    await expect(execute(t.ctx, prioritySetStatus, { priorityId: a.id, status: 'bogus' as never })).rejects.toMatchObject({ code: 'validation' })
    await execute(t.ctx, priorityReorder, { quarter: a.quarter, priorityIds: [b.id, a.id] })
    expect((await listPriorities(t.ctx)).map((x) => x.title)).toEqual(['B', 'A2'])
    await expect(execute(t.ctx, priorityUpdate, { priorityId: a.id, title: 'x' }, { expectedVersion: 1 })).rejects.toMatchObject({ code: 'conflict' })
    const audit = await listAudit(t.ctx, { entityType: 'priority', entityId: a.id })
    expect(audit.items.map((i) => i.command)).toContain('priority.set_status')
  })

  it('milestones: add, update, toggle, reorder, delete', async () => {
    const t = await seedTestOrg(db)
    const p = ok(await execute(t.ctx, priorityCreate, { title: 'P' }))
    const m1 = ok(await execute(t.ctx, milestoneAdd, { priorityId: p.id, title: 'one' }))
    const m2 = ok(await execute(t.ctx, milestoneAdd, { priorityId: p.id, title: 'two' }))
    ok(await execute(t.ctx, milestoneUpdate, { milestoneId: m1.id, title: 'uno', dueDate: '2026-11-30' }))
    const done = ok(await execute(t.ctx, milestoneToggle, { milestoneId: m2.id }))
    expect(done.doneAt).not.toBeNull()
    expect(ok(await execute(t.ctx, milestoneToggle, { milestoneId: m2.id })).doneAt).toBeNull()
    expect(ok(await execute(t.ctx, milestoneToggle, { milestoneId: m2.id, done: true })).doneAt).not.toBeNull()
    await execute(t.ctx, milestoneReorder, { priorityId: p.id, milestoneIds: [m2.id, m1.id] })
    expect((await getPriority(t.ctx, p.id)).milestones.map((m) => m.title)).toEqual(['two', 'uno'])
    await expect(execute(t.ctx, milestoneReorder, { priorityId: p.id, milestoneIds: [m2.id] })).rejects.toMatchObject({ code: 'validation' })
    await execute(t.ctx, milestoneDelete, { milestoneId: m1.id })
    const list = await listPriorities(t.ctx)
    expect(list[0]).toMatchObject({ milestonesTotal: 1, milestonesDone: 1 })
  })

  it('cascades to a team and links parents without cycles', async () => {
    const t = await seedTestOrg(db)
    const team = (await listTeams(t.ctx))[0]!
    const parent = ok(await execute(t.ctx, priorityCreate, { title: 'Company goal' }))
    const child = ok(await execute(t.ctx, priorityCascade, { priorityId: parent.id, teamId: team.id }))
    expect(child).toMatchObject({ parentPriorityId: parent.id, level: 'team', teamId: team.id, quarter: parent.quarter })
    const detail = await getPriority(t.ctx, parent.id)
    expect(detail.children.map((c) => c.id)).toEqual([child.id])
    expect((await getPriority(t.ctx, child.id)).parent!.id).toBe(parent.id)
    await expect(execute(t.ctx, priorityUpdate, { priorityId: parent.id, parentPriorityId: child.id })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, priorityUpdate, { priorityId: parent.id, parentPriorityId: parent.id })).rejects.toMatchObject({ code: 'validation' })
  })

  it('summarizes a quarter with week N of 13', async () => {
    const t = await seedTestOrg(db)
    const a = ok(await execute(t.ctx, priorityCreate, { title: 'A', quarter: '2026-Q4', milestones: [{ title: 'm' }] }))
    ok(await execute(t.ctx, priorityCreate, { title: 'B', quarter: '2026-Q4' }))
    await execute(t.ctx, prioritySetStatus, { priorityId: a.id, status: 'off_track' })
    const s = await prioritiesSummary(t.ctx, { quarter: '2026-Q4', asOf: '2026-11-02' })
    expect(s).toMatchObject({ quarter: '2026-Q4', total: 2, byStatus: { on_track: 1, off_track: 1, done: 0, not_done: 0, dropped: 0 }, milestonesTotal: 1 })
    expect(s.week).toEqual({ week: 6, of: 13 })
    expect((await prioritiesSummary(t.ctx, { quarter: '2026-Q3', asOf: '2026-11-02' })).week).toBeNull()
  })

  it('soft-deletes and isolates orgs', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const p = ok(await execute(a.ctx, priorityCreate, { title: 'Private', milestones: [{ title: 'm' }] }))
    await expect(getPriority(b.ctx, p.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, prioritySetStatus, { priorityId: p.id, status: 'done' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, milestoneAdd, { priorityId: p.id, title: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, priorityCreate, { title: 'x', ownerId: a.ctx.actor.id })).rejects.toMatchObject({ code: 'not_found' })
    await execute(a.ctx, priorityDelete, { priorityId: p.id })
    await expect(getPriority(a.ctx, p.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(await listPriorities(a.ctx)).toEqual([])
  })

  it('enforces agent scopes and gates deletes behind approval', async () => {
    const t = await seedTestOrg(db)
    const reader = await t.addAgent('Reader', ['read'])
    const writer = await t.addAgent('Writer', ['read', 'write:priorities'])
    const blind = await t.addAgent('Blind', ['write:priorities'])
    await expect(execute(reader.ctx, priorityCreate, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(listPriorities(blind.ctx)).rejects.toMatchObject({ code: 'forbidden_scope' })
    const p = ok(await execute(writer.ctx, priorityCreate, { title: 'by agent' }))
    expect(p.createdByActor).toMatchObject({ type: 'agent', id: writer.agentId })
    expect(ok(await execute(writer.ctx, prioritySetStatus, { priorityId: p.id, status: 'done' })).status).toBe('done')
    const r = await execute(writer.ctx, priorityDelete, { priorityId: p.id })
    expect(r.ok).toBe(false)
    expect(await listPriorities(t.ctx)).toHaveLength(1)
    if (!r.ok) await approveApproval(t.ctx, r.approvalId)
    expect(await listPriorities(t.ctx)).toHaveLength(0)
  })

  it('viewers cannot write', async () => {
    const t = await seedTestOrg(db)
    const v = await t.addPerson('Vera', 'viewer')
    await expect(execute(v.ctx, priorityCreate, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(await listPriorities(v.ctx)).toEqual([])
  })
})
