import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@motion/db'
import {
  approveApproval, chartAddSeat, chartAssignPeople, chartCreateDraft, chartDeleteSeat, chartDiscardDraft, chartMoveSeat, chartProposeChange, chartPublish, chartReorderSeats,
  chartSetAssistingAgents, chartUpdateSeat, execute, getChart, getChartRevision, listApprovals, listChartRevisions, STANDARD_SEATS,
  type SeatNode,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}
const flat = (nodes: SeatNode[]): SeatNode[] => nodes.flatMap((n) => [n, ...flat(n.children)])
const titles = (nodes: SeatNode[]) => flat(nodes).map((n) => n.title)

async function liveChart(t: Awaited<ReturnType<typeof seedTestOrg>>) {
  const { revision } = ok(await execute(t.ctx, chartCreateDraft, { from: 'template' }))
  ok(await execute(t.ctx, chartPublish, { revisionId: revision.id }))
  return (await getChart(t.ctx)).published!
}

describe('chart', () => {
  it('starts empty; the template draft has the standard five seats; publishing goes live', async () => {
    const t = await seedTestOrg(db)
    expect(await getChart(t.ctx)).toEqual({ chart: null, published: null, draft: null })
    const d = ok(await execute(t.ctx, chartCreateDraft, { from: 'template' }))
    expect(d).toMatchObject({ created: true, revision: { number: 1, status: 'draft' } })
    const draft = await getChartRevision(t.ctx, d.revision.id)
    expect(draft.seatCount).toBe(5)
    expect(draft.seats).toHaveLength(1)
    expect(draft.seats[0]!.title).toBe(STANDARD_SEATS.root)
    expect(draft.seats[0]!.children.map((c) => c.title)).toEqual([...STANDARD_SEATS.children])
    await expect(execute(t.ctx, chartCreateDraft, { from: 'blank' })).rejects.toMatchObject({ code: 'conflict' })
    expect(ok(await execute(t.ctx, chartCreateDraft, {})).created).toBe(false)
    ok(await execute(t.ctx, chartPublish, { revisionId: d.revision.id }))
    const v = await getChart(t.ctx)
    expect(v.published!.revision).toMatchObject({ number: 1, status: 'published' })
    expect(v.draft).toBeNull()
  })

  it('edits a draft copy of the published chart without touching the live one', async () => {
    const t = await seedTestOrg(db)
    const live = await liveChart(t)
    const d = ok(await execute(t.ctx, chartCreateDraft, {}))
    expect(d.revision.number).toBe(2)
    const draft = await getChartRevision(t.ctx, d.revision.id)
    expect(draft.seatCount).toBe(5)
    expect(flat(draft.seats).map((s) => s.id).some((id) => flat(live.seats).some((l) => l.id === id))).toBe(false)
    const root = draft.seats[0]!
    const sales = root.children[0]!
    const newSeat = ok(await execute(t.ctx, chartAddSeat, { revisionId: d.revision.id, title: 'Delivery', parentSeatId: root.id, responsibilities: ['Client outcomes'] }))
    ok(await execute(t.ctx, chartUpdateSeat, { seatId: sales.id, title: 'Growth', responsibilities: ['Pipeline'] }))
    ok(await execute(t.ctx, chartMoveSeat, { seatId: newSeat.id, parentSeatId: sales.id }))
    expect(titles((await getChartRevision(t.ctx, d.revision.id)).seats)).toContain('Growth')
    expect((await getChart(t.ctx)).published!.seatCount).toBe(5)
    expect(titles((await getChart(t.ctx)).published!.seats)).toContain('Sales & marketing')
    ok(await execute(t.ctx, chartPublish, { revisionId: d.revision.id }))
    const now = await getChart(t.ctx)
    expect(now.published!.revision.number).toBe(2)
    expect(now.published!.seats[0]!.children.find((c) => c.title === 'Growth')!.children.map((c) => c.title)).toEqual(['Delivery'])
    expect((await listChartRevisions(t.ctx)).map((r) => [r.number, r.status])).toEqual([[2, 'published'], [1, 'archived']])
    // published seats are immutable
    await expect(execute(t.ctx, chartUpdateSeat, { seatId: now.published!.seats[0]!.id, title: 'x' })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('moves, reorders, deletes seats safely', async () => {
    const t = await seedTestOrg(db)
    const d = ok(await execute(t.ctx, chartCreateDraft, { from: 'template' }))
    const root = (await getChartRevision(t.ctx, d.revision.id)).seats[0]!
    const [a, b, c, e] = root.children
    await expect(execute(t.ctx, chartMoveSeat, { seatId: root.id, parentSeatId: a!.id })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, chartMoveSeat, { seatId: a!.id, parentSeatId: a!.id })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, chartMoveSeat, { seatId: a!.id, parentSeatId: null })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, chartAddSeat, { revisionId: d.revision.id, title: 'Second top' })).rejects.toMatchObject({ code: 'validation' })
    await execute(t.ctx, chartReorderSeats, { revisionId: d.revision.id, parentSeatId: root.id, seatIds: [e!.id, c!.id, b!.id, a!.id] })
    expect((await getChartRevision(t.ctx, d.revision.id)).seats[0]!.children.map((x) => x.title)).toEqual([e!.title, c!.title, b!.title, a!.title])
    await expect(execute(t.ctx, chartReorderSeats, { revisionId: d.revision.id, parentSeatId: root.id, seatIds: [e!.id] })).rejects.toMatchObject({ code: 'validation' })
    // children move up when a middle seat is deleted
    const grand = ok(await execute(t.ctx, chartAddSeat, { revisionId: d.revision.id, title: 'Grand', parentSeatId: a!.id }))
    await execute(t.ctx, chartDeleteSeat, { seatId: a!.id })
    const after = await getChartRevision(t.ctx, d.revision.id)
    expect(after.seatCount).toBe(5)
    expect(after.seats[0]!.children.map((x) => x.id)).toContain(grand.id)
    await expect(execute(t.ctx, chartDeleteSeat, { seatId: root.id })).rejects.toMatchObject({ code: 'validation' })
  })

  it('assigns people and assisting agents; validates ids', async () => {
    const t = await seedTestOrg(db)
    const other = await seedTestOrg(db)
    const mia = await t.addPerson('Mia')
    const bot = await t.addAgent('Helper', ['read'])
    const d = ok(await execute(t.ctx, chartCreateDraft, { from: 'blank' }))
    const top = ok(await execute(t.ctx, chartAddSeat, { revisionId: d.revision.id, title: 'CEO', personIds: [t.ctx.actor.id] }))
    ok(await execute(t.ctx, chartAssignPeople, { seatId: top.id, personIds: [t.ctx.actor.id, mia.personId] }))
    ok(await execute(t.ctx, chartSetAssistingAgents, { seatId: top.id, agentIds: [bot.agentId] }))
    const seat = (await getChartRevision(t.ctx, d.revision.id)).seats[0]!
    expect(seat.people.map((p) => p.id).sort()).toEqual([t.ctx.actor.id, mia.personId].sort())
    expect(seat.assistingAgents).toEqual([{ id: bot.agentId, name: 'Helper' }])
    const stranger = await other.addPerson('Zed')
    await expect(execute(t.ctx, chartAssignPeople, { seatId: top.id, personIds: [stranger.personId] })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(t.ctx, chartSetAssistingAgents, { seatId: top.id, agentIds: [(await other.addAgent('X')).agentId] })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('publishing needs one top seat, admin role; agents need approval; discard works', async () => {
    const t = await seedTestOrg(db)
    const d = ok(await execute(t.ctx, chartCreateDraft, { from: 'blank' }))
    await expect(execute(t.ctx, chartPublish, { revisionId: d.revision.id })).rejects.toMatchObject({ code: 'validation' })
    ok(await execute(t.ctx, chartAddSeat, { revisionId: d.revision.id, title: 'CEO' }))
    const member = await t.addPerson('Mia', 'member')
    await expect(execute(member.ctx, chartPublish, { revisionId: d.revision.id })).rejects.toMatchObject({ code: 'forbidden' })
    const agent = await t.addAgent('Proposer', ['read', 'propose:chart'])
    const r = await execute(agent.ctx, chartPublish, { revisionId: d.revision.id })
    expect(r.ok).toBe(false)
    expect((await getChart(t.ctx)).published).toBeNull()
    if (!r.ok) await approveApproval(t.ctx, r.approvalId)
    expect((await getChart(t.ctx)).published!.seatCount).toBe(1)
    const d2 = ok(await execute(t.ctx, chartCreateDraft, {}))
    await execute(t.ctx, chartDiscardDraft, { revisionId: d2.revision.id })
    expect((await getChart(t.ctx)).draft).toBeNull()
    expect(ok(await execute(t.ctx, chartCreateDraft, {})).revision.number).toBe(3)
  })

  it('propose_change from an agent: approval, then applied to a copy of the published chart and published', async () => {
    const t = await seedTestOrg(db)
    const live = await liveChart(t)
    const mia = await t.addPerson('Mia')
    const agent = await t.addAgent('Org agent', ['read', 'propose:chart'])
    const liveOps = live.seats[0]!.children.find((c) => c.title === 'Operations')!
    const r = await execute(agent.ctx, chartProposeChange, {
      reason: 'Add delivery',
      ops: [
        { op: 'add_seat', title: 'Delivery', parent: 'Operations', responsibilities: ['Client outcomes'] },
        { op: 'assign_people', seat: liveOps.id, personIds: [mia.personId] }, // published seat id works
        { op: 'update_seat', seat: 'Finance & admin', title: 'Finance' },
      ],
    })
    expect(r.ok).toBe(false)
    expect(titles((await getChart(t.ctx)).published!.seats)).not.toContain('Delivery')
    const pending = (await listApprovals(t.ctx, { status: 'pending' })).items[0]!
    expect(pending.action).toBe('chart.propose_change')
    await approveApproval(t.ctx, pending.id)
    const now = await getChart(t.ctx)
    expect(now.published!.revision.number).toBe(2)
    expect(now.draft).toBeNull()
    const ops = now.published!.seats[0]!.children.find((c) => c.title === 'Operations')!
    expect(ops.people.map((p) => p.id)).toEqual([mia.personId])
    expect(ops.children.map((c) => c.title)).toEqual(['Delivery'])
    expect(titles(now.published!.seats)).toContain('Finance')
  })

  it('propose_change by a person goes to the draft; bad refs fail atomically', async () => {
    const t = await seedTestOrg(db)
    await liveChart(t)
    const r = ok(await execute(t.ctx, chartProposeChange, { ops: [{ op: 'add_seat', title: 'Extra', parent: 'Operations' }] }))
    expect(r).toMatchObject({ published: false, revision: { status: 'draft', number: 2 } })
    const v = await getChart(t.ctx)
    expect(titles(v.draft!.seats)).toContain('Extra')
    expect(titles(v.published!.seats)).not.toContain('Extra')
    await expect(execute(t.ctx, chartProposeChange, { ops: [{ op: 'delete_seat', seat: 'Nope' }] })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(t.ctx, chartProposeChange, { ops: [{ op: 'bogus' }] } as never)).rejects.toMatchObject({ code: 'validation' })
    const member = await t.addPerson('Mia', 'member')
    await expect(execute(member.ctx, chartProposeChange, { ops: [{ op: 'delete_seat', seat: 'Extra' }], publish: true })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('enforces scopes and org isolation', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const live = await liveChart(a)
    const reader = await a.addAgent('Reader', ['read'])
    await expect(execute(reader.ctx, chartCreateDraft, {})).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(execute(reader.ctx, chartProposeChange, { ops: [{ op: 'delete_seat', seat: 'x' }] })).rejects.toMatchObject({ code: 'forbidden_scope' })
    expect((await getChart(reader.ctx)).published!.seatCount).toBe(5)
    const blind = await a.addAgent('Blind', ['propose:chart'])
    await expect(getChart(blind.ctx)).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(getChartRevision(b.ctx, live.revision.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, chartUpdateSeat, { seatId: live.seats[0]!.id, title: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, chartPublish, { revisionId: live.revision.id })).rejects.toMatchObject({ code: 'not_found' })
    expect(await getChart(b.ctx)).toEqual({ chart: null, published: null, draft: null })
    expect(await listChartRevisions(b.ctx)).toEqual([])
  })
})
