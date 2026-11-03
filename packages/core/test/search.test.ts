import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { meetings, metricValues, metrics, priorities, scorecards, newId, type DbHandle } from '@movara/db'
import { eq } from 'drizzle-orm'
import { currentQuarter, execute, getOrg, headlinePost, issueCreate, listTeams, meetingSeriesCreate, myWeek, search, todayIn, periodStart, todoCreate, base } from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

describe('search and my week', () => {
  it('finds entities by type, escapes wildcards and isolates orgs', async () => {
    const o = await seedTestOrg(db)
    const other = await seedTestOrg(db)
    const team = (await listTeams(o.ctx))[0]!
    const alice = await o.addPerson('Zelda Alice')
    await execute(o.ctx, issueCreate, { title: 'Zebra pricing issue', teamId: team.id })
    await execute(o.ctx, todoCreate, { title: 'Call the zebra farm', teamId: team.id })
    await execute(o.ctx, headlinePost, { text: 'Zebra signed', teamId: team.id })
    await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Zebra weekly', rrule: null, firstScheduledAt: new Date() })
    await execute(other.ctx, issueCreate, { title: 'Zebra in another org' })
    const hits = await search(o.ctx, 'zebra')
    expect(hits.map((h) => h.type).sort()).toEqual(['headline', 'issue', 'meeting', 'todo'])
    expect((await search(o.ctx, 'zebra', { types: ['issue'] })).map((h) => h.type)).toEqual(['issue'])
    expect((await search(o.ctx, 'zelda')).map((h) => h.id)).toEqual([alice.personId])
    expect(await search(o.ctx, '%')).toHaveLength(0)
    expect(await search(o.ctx, '  ')).toEqual([])
    expect(await search(o.ctx, 'zebra', { limit: 2 })).toHaveLength(2)
    const noRead = await o.addAgent('NoRead', ['write:todos'])
    await expect(search(noRead.ctx, 'zebra')).rejects.toMatchObject({ code: 'forbidden_scope' })
  })

  it('builds my week: priorities, metrics due, open to-dos, next meeting', async () => {
    const o = await seedTestOrg(db)
    const team = (await listTeams(o.ctx))[0]!
    const org = await getOrg(o.ctx)
    const me = o.ctx.actor.id
    const today = todayIn(org)
    await db.insert(priorities).values({ ...base(o.ctx), title: 'Ship v1', ownerId: me, teamId: team.id, quarter: currentQuarter(org), level: 'team', status: 'on_track' })
    const sc = newId()
    await db.insert(scorecards).values({ ...base(o.ctx), id: sc, teamId: team.id, interval: 'week', weekStartDay: org.weekStartDay })
    const [m1, m2] = [newId(), newId()]
    await db.insert(metrics).values([
      { ...base(o.ctx), id: m1, scorecardId: sc, title: 'Leads', ownerIds: [me] },
      { ...base(o.ctx), id: m2, scorecardId: sc, title: 'Calls', ownerIds: [me] },
    ])
    await db.insert(metricValues).values({ ...base(o.ctx), metricId: m2, periodStart: periodStart(today, 'week', org), value: 5 })
    await execute(o.ctx, todoCreate, { title: 'Mine open', teamId: team.id })
    await execute(o.ctx, todoCreate, { title: 'Mine late', dueDate: '2020-01-01' })
    await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Weekly', attendeeIds: [me], rrule: 'FREQ=WEEKLY;BYDAY=MO' })
    const w = await myWeek(o.ctx)
    expect(w.priorities.map((p) => p.title)).toEqual(['Ship v1'])
    expect(w.metricsDue.map((m) => m.title)).toEqual(['Leads'])
    expect(w.todos.map((t) => t.title)).toEqual(['Mine late', 'Mine open'])
    expect(w.todos[0]!.overdue).toBe(true)
    expect(w.nextMeeting?.name).toBe('Weekly')
    expect(w.nextMeeting?.missed).toBe(false)
    // A meeting that was due days ago and never started still shows (flagged), instead of hiding the series.
    await db.update(meetings).set({ scheduledAt: new Date(Date.now() - 3 * 86400_000) }).where(eq(meetings.id, w.nextMeeting!.id))
    const later = await myWeek(o.ctx)
    expect(later.nextMeeting?.id).toBe(w.nextMeeting!.id)
    expect(later.nextMeeting?.missed).toBe(true)
    expect(w.week.of).toBe(13)
    // agents see their owner's week
    const ag = await o.addAgent('Reader', ['read'])
    expect((await myWeek(ag.ctx)).personId).toBe(me)
  })
})
