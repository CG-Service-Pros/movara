import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@movara/db'
import {
  execute, getIssue, getTodo, headlineCascade, headlineDelete, headlineMarkReviewed, headlinePost, headlineUpdate, issueCreate, issueDrop, issueMove, issueReopen, issueSetRank, issueSolve,
  issueUpdate, listHeadlines, listIssues, listTeams, listTodos, teamsCreate, todoComplete, todoCreate, todoDelete, todoUncomplete, todoUpdate, addDays, todayIn, getOrg,
  meetingSeriesCreate, meetingStart, meetingEnd, meetingSetSettings,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

async function setup() {
  const o = await seedTestOrg(db)
  const team = (await listTeams(o.ctx))[0]!
  const a = await o.addPerson('Alice')
  const b = await o.addPerson('Bob')
  return { ...o, team, a, b }
}
const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('needs approval')
  return (r as { data: T }).data
}

describe('issues', () => {
  it('fans out per owner with source, ranks, solves, reopens, drops and moves', async () => {
    const { ctx, team, a, b } = await setup()
    const rows = ok(await execute(ctx, issueCreate, { title: 'Pricing', ownerIds: [a.personId, b.personId], teamId: team.id, source: { type: 'priority', id: 'p-1' } }))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.ownerId).sort()).toEqual([a.personId, b.personId].sort())
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
    expect(rows[0]!.source).toEqual({ type: 'priority', id: 'p-1' })
    const [third] = ok(await execute(ctx, issueCreate, { title: 'Third', teamId: team.id }))
    expect(third!.ownerId).toBe(ctx.actor.id)
    expect(third!.rank).toBe(3)

    await execute(ctx, issueSetRank, { issueId: third!.id, rank: 1 })
    expect((await listIssues(ctx, { teamId: team.id })).map((i) => i.title)).toEqual(['Third', 'Pricing', 'Pricing'])

    const solved = ok(await execute(ctx, issueSolve, { issueId: third!.id }))
    expect(solved.status).toBe('solved')
    expect(solved.solvedAt).toBeTruthy()
    expect((await listIssues(ctx, { teamId: team.id })).map((i) => i.title)).toEqual(['Pricing', 'Pricing'])
    expect(await listIssues(ctx, { teamId: team.id, status: 'solved' })).toHaveLength(1)
    const re = ok(await execute(ctx, issueReopen, { issueId: third!.id }))
    expect(re).toMatchObject({ status: 'open', solvedAt: null })

    const long = ok(await execute(ctx, issueMove, { issueId: rows[0]!.id, horizon: 'long' }))
    expect(long.horizon).toBe('long')
    expect(await listIssues(ctx, { horizon: 'long' })).toHaveLength(1)
    const t2 = ok(await execute(ctx, teamsCreate, { name: 'Other' }))
    expect(ok(await execute(ctx, issueMove, { issueId: rows[1]!.id, teamId: t2.id })).teamId).toBe(t2.id)
    expect(ok(await execute(ctx, issueDrop, { issueId: rows[1]!.id })).status).toBe('dropped')
    await expect(execute(ctx, issueSolve, { issueId: rows[1]!.id })).rejects.toMatchObject({ code: 'conflict' })
    expect(ok(await execute(ctx, issueUpdate, { issueId: third!.id, title: 'Renamed' })).title).toBe('Renamed')
    expect((await getIssue(ctx, third!.id)).title).toBe('Renamed')
  })

  it('enforces scopes, org isolation and optimistic concurrency', async () => {
    const x = await setup()
    const y = await seedTestOrg(db)
    const [i] = ok(await execute(x.ctx, issueCreate, { title: 'Secret' }))
    await expect(getIssue(y.ctx, i!.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(y.ctx, issueSolve, { issueId: i!.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(y.ctx, issueCreate, { title: 'x', ownerIds: [x.a.personId] })).rejects.toMatchObject({ code: 'not_found' })
    const noWrite = await x.addAgent('Reader', ['read'])
    await expect(execute(noWrite.ctx, issueCreate, { title: 'nope' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const noRead = await x.addAgent('Writer', ['write:issues'])
    await expect(listIssues(noRead.ctx)).rejects.toMatchObject({ code: 'forbidden_scope' })
    const w = await x.addAgent('Both', ['read', 'write:issues'])
    expect(ok(await execute(w.ctx, issueCreate, { title: 'By agent' }))[0]!.createdByActor).toMatchObject({ type: 'agent' })
    await expect(execute(x.ctx, issueUpdate, { issueId: i!.id, title: 'v' }, { expectedVersion: 99 })).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('todos', () => {
  it('fans out, defaults due date to +7 days in the org timezone, and filters', async () => {
    const { ctx, team, a, b } = await setup()
    const rows = ok(await execute(ctx, todoCreate, { title: 'Call client', ownerIds: [a.personId, b.personId], teamId: team.id }))
    expect(rows).toHaveLength(2)
    const org = await getOrg(ctx)
    expect(rows[0]!.dueDate).toBe(addDays(todayIn(org), 7))
    const [personal] = ok(await execute(ctx, todoCreate, { title: 'Mine', dueDate: '2020-01-01' }))
    expect(personal!.teamId).toBeNull()
    expect(await listTodos(ctx, { personal: true })).toHaveLength(1)
    expect((await listTodos(ctx, { overdue: true })).map((t) => t.id)).toEqual([personal!.id])
    expect(await listTodos(ctx, { ownerId: a.personId })).toHaveLength(1)
    expect(await listTodos(ctx, { teamId: team.id, status: 'open' })).toHaveLength(2)
    expect(ok(await execute(ctx, todoUpdate, { todoId: personal!.id, dueDate: '2099-01-01' })).dueDate).toBe('2099-01-01')
    await execute(ctx, todoDelete, { todoId: personal!.id })
    await expect(getTodo(ctx, personal!.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('completes to done normally and to pending while the team meeting is live', async () => {
    const { ctx, team } = await setup()
    const [t1] = ok(await execute(ctx, todoCreate, { title: 'Before', teamId: team.id }))
    const [t2] = ok(await execute(ctx, todoCreate, { title: 'During', teamId: team.id }))
    const [personal] = ok(await execute(ctx, todoCreate, { title: 'Personal' }))
    const done = ok(await execute(ctx, todoComplete, { todoId: t1!.id }))
    expect(done.status).toBe('done')
    expect(done.doneAt).toBeTruthy()
    expect(ok(await execute(ctx, todoUncomplete, { todoId: t1!.id })).status).toBe('open')

    const s = ok(await execute(ctx, meetingSeriesCreate, { teamId: team.id, name: 'Weekly', attendeeIds: [ctx.actor.id] }))
    const m = ok(await execute(ctx, meetingStart, { seriesId: s.series.id }))
    const pending = ok(await execute(ctx, todoComplete, { todoId: t2!.id }))
    expect(pending).toMatchObject({ status: 'pending', doneAt: null })
    expect(ok(await execute(ctx, todoComplete, { todoId: personal!.id })).status).toBe('done') // personal: no live meeting applies
    await execute(ctx, meetingSetSettings, { meetingId: m.id, clearItems: false })
    ok(await execute(ctx, meetingEnd, { meetingId: m.id }))
    expect((await getTodo(ctx, t2!.id)).status).toBe('done')
  })

  it('denies agents without write:todos and isolates orgs', async () => {
    const x = await setup()
    const y = await seedTestOrg(db)
    const ag = await x.addAgent('NoTodos', ['read', 'write:issues'])
    await expect(execute(ag.ctx, todoCreate, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const [t] = ok(await execute(x.ctx, todoCreate, { title: 'Org X' }))
    await expect(execute(y.ctx, todoComplete, { todoId: t!.id })).rejects.toMatchObject({ code: 'not_found' })
    expect(await listTodos(y.ctx)).toHaveLength(0)
    const viewer = await x.addPerson('Vi', 'viewer')
    await expect(execute(viewer.ctx, todoCreate, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('headlines', () => {
  it('posts with fan-out, reviews, cascades (once) and deletes', async () => {
    const { ctx, team, a, b } = await setup()
    const other = ok(await execute(ctx, teamsCreate, { name: 'Delivery' }))
    const rows = ok(await execute(ctx, headlinePost, { text: 'Big win', kind: 'customer', ownerIds: [a.personId, b.personId], teamId: team.id }))
    expect(rows).toHaveLength(2)
    expect(ok(await execute(ctx, headlineUpdate, { headlineId: rows[0]!.id, text: 'Bigger win' })).text).toBe('Bigger win')
    expect(ok(await execute(ctx, headlineMarkReviewed, { headlineId: rows[0]!.id })).reviewedAt).toBeTruthy()
    expect(await listHeadlines(ctx, { teamId: team.id, reviewed: false })).toHaveLength(1)
    const copies = ok(await execute(ctx, headlineCascade, { headlineId: rows[0]!.id, teamIds: [other.id, team.id] }))
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ teamId: other.id, cascadedFromId: rows[0]!.id, reviewedAt: null })
    expect(ok(await execute(ctx, headlineCascade, { headlineId: rows[0]!.id, teamIds: [other.id] }))).toHaveLength(0)
    await execute(ctx, headlineDelete, { headlineId: rows[1]!.id })
    expect(await listHeadlines(ctx, { teamId: team.id })).toHaveLength(1)
  })

  it('denies agents without write:headlines and isolates orgs', async () => {
    const x = await setup()
    const y = await seedTestOrg(db)
    const ag = await x.addAgent('NoHl', ['read'])
    await expect(execute(ag.ctx, headlinePost, { text: 'x', teamId: x.team.id })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const [h] = ok(await execute(x.ctx, headlinePost, { text: 'x', teamId: x.team.id }))
    await expect(execute(y.ctx, headlineMarkReviewed, { headlineId: h!.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(y.ctx, headlinePost, { text: 'x', teamId: x.team.id })).rejects.toMatchObject({ code: 'not_found' })
  })
})
