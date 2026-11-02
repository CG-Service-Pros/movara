import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@motion/db'
import {
  execute, getMetric, getScorecard, listScorecards, listTeams, metricArchive, metricCreate, metricRecordValues, metricReorder, metricStatus, metricUpdate, offTrackMetrics,
  scorecardCreate, scorecardUpdateSettings, approveApproval, type MetricComparison,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}
const NOW = '2026-11-04' // a Wednesday; the current week starts Monday 2026-11-02

async function setup() {
  const t = await seedTestOrg(db)
  const team = (await listTeams(t.ctx))[0]!
  const sc = ok(await execute(t.ctx, scorecardCreate, { teamId: team.id }))
  return { ...t, team, sc }
}

describe('metric status math', () => {
  const m = (comparison: MetricComparison, goal: number | null, goalUpper: number | null = null) => ({ comparison, goal, goalUpper })
  it('handles every comparison, boundaries, between and missing', () => {
    expect(metricStatus(m('gte', 10), 10)).toBe('on')
    expect(metricStatus(m('gte', 10), 9.99)).toBe('off')
    expect(metricStatus(m('gt', 10), 10)).toBe('off')
    expect(metricStatus(m('gt', 10), 11)).toBe('on')
    expect(metricStatus(m('lte', 7), 7)).toBe('on')
    expect(metricStatus(m('lte', 7), 8)).toBe('off')
    expect(metricStatus(m('lt', 7), 7)).toBe('off')
    expect(metricStatus(m('lt', 7), 6)).toBe('on')
    expect(metricStatus(m('eq', 5), 5)).toBe('on')
    expect(metricStatus(m('eq', 5), 6)).toBe('off')
    expect(metricStatus(m('between', 10, 20), 10)).toBe('on')
    expect(metricStatus(m('between', 10, 20), 20)).toBe('on')
    expect(metricStatus(m('between', 10, 20), 9)).toBe('off')
    expect(metricStatus(m('between', 10, 20), 21)).toBe('off')
    expect(metricStatus(m('gte', 10), null)).toBe('missing')
    expect(metricStatus(m('gte', 10), undefined)).toBe('missing')
    expect(metricStatus(m('gte', 0), 0)).toBe('on')
    expect(metricStatus(m('gte', null), 3)).toBe('on')
  })
})

describe('scorecard', () => {
  it('creates one scorecard per team with settings', async () => {
    const s = await setup()
    expect(s.sc).toMatchObject({ interval: 'week', weekStartDay: 1, periodsShown: 13 })
    await expect(execute(s.ctx, scorecardCreate, { teamId: s.team.id })).rejects.toMatchObject({ code: 'conflict' })
    const upd = ok(await execute(s.ctx, scorecardUpdateSettings, { scorecardId: s.sc.id, periodsShown: 8, interval: 'month' }))
    expect(upd).toMatchObject({ periodsShown: 8, interval: 'month' })
    expect((await listScorecards(s.ctx))[0]).toMatchObject({ teamName: s.team.name, metricCount: 0 })
    const member = await s.addPerson('Mia', 'member')
    await expect(execute(member.ctx, scorecardUpdateSettings, { scorecardId: s.sc.id, periodsShown: 5 })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('validates and manages metrics', async () => {
    const s = await setup()
    await expect(execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'x', comparison: 'between', goal: 5 })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'x', comparison: 'between', goal: 5, goalUpper: 2 })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: '', goal: 1 })).rejects.toMatchObject({ code: 'validation' })
    const a = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Leads', goal: 10, additive: true, ownerIds: [s.ctx.actor.id] }))
    const b = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Margin', goal: 20, goalUpper: 30, comparison: 'between', unit: 'percent', decimals: 1 }))
    expect(b).toMatchObject({ sort: 1, unit: 'percent' })
    expect(ok(await execute(s.ctx, metricUpdate, { metricId: a.id, goal: 12, scale: 1000 }))).toMatchObject({ goal: 12, scale: 1000 })
    await expect(execute(s.ctx, metricUpdate, { metricId: b.id, goalUpper: 10 })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'x', goal: 1, ownerIds: ['0192f6c2-3b3a-7000-8000-000000000000'] })).rejects.toMatchObject({ code: 'not_found' })
    await execute(s.ctx, metricReorder, { scorecardId: s.sc.id, metricIds: [b.id, a.id] })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, asOf: NOW })).metrics.map((m) => m.title)).toEqual(['Margin', 'Leads'])
    await expect(execute(s.ctx, metricReorder, { scorecardId: s.sc.id, metricIds: [a.id] })).rejects.toMatchObject({ code: 'validation' })
    await execute(s.ctx, metricArchive, { metricId: b.id })
    await expect(getMetric(s.ctx, b.id)).rejects.toMatchObject({ code: 'not_found' })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, asOf: NOW })).metrics).toHaveLength(1)
  })

  it('records values by id or exact title, normalizing and upserting by period', async () => {
    const s = await setup()
    const leads = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Leads', goal: 10, additive: true }))
    const r = ok(await execute(s.ctx, metricRecordValues, {
      scorecardId: s.sc.id,
      values: [
        { metricTitle: 'Leads', periodStart: '2026-11-04', value: 12, note: 'good week' }, // Wednesday -> Monday 2026-11-02
        { metricId: leads.id, periodStart: '2026-10-28', value: 8 }, // -> 2026-10-26
      ],
    }))
    expect(r.items.map((i) => i.periodStart).sort()).toEqual(['2026-10-26', '2026-11-02'])
    // same period again (Friday of the same week) updates instead of inserting; note is kept
    await execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricTitle: 'Leads', periodStart: '2026-11-06', value: 15 }] })
    const v = await getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 3, asOf: NOW })
    expect(v.periods).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
    expect(v.metrics[0]!.cells.map((c) => [c.value, c.status])).toEqual([[null, 'missing'], [8, 'off'], [15, 'on']])
    expect(v.metrics[0]!.cells[2]!.note).toBe('good week')
    // duplicates in one batch: last wins
    await execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricTitle: 'Leads', periodStart: '2026-11-02', value: 1 }, { metricTitle: 'Leads', periodStart: '2026-11-03', value: 2 }] })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 1, asOf: NOW })).metrics[0]!.cells[0]!.value).toBe(2)
  })

  it('normalizes to month and respects weekStartDay', async () => {
    const s = await setup()
    await execute(s.ctx, scorecardUpdateSettings, { scorecardId: s.sc.id, interval: 'month' })
    const m = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Revenue', goal: 1 }))
    await execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, periodStart: '2026-10-17', value: 5 }] })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 2, asOf: NOW })).metrics[0]!.cells[0]).toMatchObject({ periodStart: '2026-10-01', value: 5 })
    await execute(s.ctx, scorecardUpdateSettings, { scorecardId: s.sc.id, interval: 'week', weekStartDay: 0 }) // Sunday weeks
    await execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, periodStart: '2026-11-04', value: 9 }] })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 1, asOf: NOW })).metrics[0]!.cells[0]).toMatchObject({ periodStart: '2026-11-01', value: 9 })
  })

  it('rejects bad batches atomically', async () => {
    const s = await setup()
    const m = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Leads', goal: 10 }))
    await expect(execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, periodStart: '2026-11-02', value: 1 }, { metricTitle: 'Nope', periodStart: '2026-11-02', value: 1 }] })).rejects.toMatchObject({ code: 'not_found' })
    expect((await getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 1, asOf: NOW })).metrics[0]!.cells[0]!.value).toBeNull()
    await expect(execute(s.ctx, metricRecordValues, { values: [{ metricTitle: 'Leads', periodStart: '2026-11-02', value: 1 }] })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, metricTitle: 'Leads', periodStart: '2026-11-02', value: 1 }] })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, periodStart: 'nov', value: 1 }] })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [] })).rejects.toMatchObject({ code: 'validation' })
  })

  it('computes statuses, totals, averages and on-track counts', async () => {
    const s = await setup()
    const sum = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Leads', goal: 10, additive: true }))
    const avg = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Days', goal: 7, comparison: 'lte' }))
    const band = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Margin', goal: 20, goalUpper: 30, comparison: 'between' }))
    const gap = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'NPS', goal: 50 }))
    await execute(s.ctx, metricRecordValues, {
      scorecardId: s.sc.id,
      values: [
        { metricId: sum.id, periodStart: '2026-10-26', value: 4 }, { metricId: sum.id, periodStart: '2026-11-02', value: 12 },
        { metricId: avg.id, periodStart: '2026-10-26', value: 10 }, { metricId: avg.id, periodStart: '2026-11-02', value: 9 },
        { metricId: band.id, periodStart: '2026-11-02', value: 25 },
        { metricId: gap.id, periodStart: '2026-10-26', value: 60 },
      ],
    })
    const v = await getScorecard(s.ctx, { teamId: s.team.id, periods: 2, asOf: NOW })
    const by = Object.fromEntries(v.metrics.map((m) => [m.title, m]))
    expect(by.Leads).toMatchObject({ total: 16, average: 8, latestStatus: 'on' })
    expect(by.Days).toMatchObject({ total: null, average: 9.5, latestStatus: 'off' })
    expect(by.Margin!.latestStatus).toBe('on')
    expect(by.NPS).toMatchObject({ latestStatus: 'missing', average: 60 })
    expect(v).toMatchObject({ latestPeriod: '2026-11-02', onTrackCount: 2, offTrackCount: 1, missingCount: 1 })
    await expect(getScorecard(s.ctx, {} as never)).rejects.toMatchObject({ code: 'validation' })
    await expect(getScorecard(s.ctx, { scorecardId: s.sc.id, periods: 0 })).rejects.toMatchObject({ code: 'validation' })
  })

  it('lists off-track metrics org-wide', async () => {
    const s = await setup()
    const a = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'A', goal: 10 }))
    const b = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'B', goal: 10 }))
    await execute(s.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: a.id, periodStart: '2026-11-02', value: 3 }, { metricId: b.id, periodStart: '2026-11-02', value: 30 }] })
    const off = await offTrackMetrics(s.ctx, { asOf: NOW })
    expect(off.map((o) => o.metric.title)).toEqual(['A'])
    expect(off[0]).toMatchObject({ teamName: s.team.name, value: 3, period: '2026-11-02' })
    const other = await seedTestOrg(db)
    expect(await offTrackMetrics(other.ctx, { asOf: NOW })).toEqual([])
  })

  it('isolates orgs', async () => {
    const a = await setup()
    const b = await seedTestOrg(db)
    const m = ok(await execute(a.ctx, metricCreate, { scorecardId: a.sc.id, title: 'Leads', goal: 1 }))
    await expect(getScorecard(b.ctx, { scorecardId: a.sc.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(getMetric(b.ctx, m.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, metricUpdate, { metricId: m.id, goal: 2 })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, metricRecordValues, { values: [{ metricId: m.id, periodStart: '2026-11-02', value: 1 }] })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, scorecardCreate, { teamId: a.team.id })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('enforces agent scopes; archiving needs approval', async () => {
    const s = await setup()
    const reader = await s.addAgent('Reader', ['read'])
    const sales = await s.addAgent('Sales', ['read', 'write:metrics'])
    const m = ok(await execute(s.ctx, metricCreate, { scorecardId: s.sc.id, title: 'Leads', goal: 10 }))
    await expect(execute(reader.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricId: m.id, periodStart: '2026-11-02', value: 1 }] })).rejects.toMatchObject({ code: 'forbidden_scope' })
    ok(await execute(sales.ctx, metricRecordValues, { scorecardId: s.sc.id, values: [{ metricTitle: 'Leads', periodStart: '2026-11-02', value: 11 }] }))
    expect((await getScorecard(reader.ctx, { scorecardId: s.sc.id, periods: 1, asOf: NOW })).metrics[0]!.cells[0]!.value).toBe(11)
    const r = await execute(sales.ctx, metricArchive, { metricId: m.id })
    expect(r.ok).toBe(false)
    await getMetric(s.ctx, m.id)
    if (!r.ok) await approveApproval(s.ctx, r.approvalId)
    await expect(getMetric(s.ctx, m.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
