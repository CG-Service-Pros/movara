import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@movara/db'
import { STANDARD_PACK } from '@movara/terminology'
import {
  endMeeting, execute, getLiveState, getMeeting, getMeetingSeries, getTodo, idsFocus, idsResolve, idsStart, issueCreate, listHeadlines, listIssues, listMeetingHistory, listMeetingSeries,
  listMeetings, listMeetingTemplates, listTeams, listTodos, meetingCapture, meetingDropToIssue, meetingHeartbeat, meetingJoin, meetingLeave, meetingNextSection, meetingPause, meetingRate,
  meetingResume, meetingReviewHeadline, meetingScheduleNext, meetingSeriesCreate, meetingSeriesUpdate, meetingSetSection, meetingSetSettings, meetingStart, meetingEnd,
  headlinePost, orgSetTerminologyPack, prepareMeeting, todoCreate, todoComplete, type EmailMessage, type EmailSender, nextOccurrence, zonedToUtc, getIssue, ctxForPerson,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('needs approval')
  return (r as { data: T }).data
}

async function setup() {
  const o = await seedTestOrg(db)
  const team = (await listTeams(o.ctx))[0]!
  const a = await o.addPerson('Alice')
  const b = await o.addPerson('Bob')
  const s = ok(await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Leadership weekly', attendeeIds: [o.ctx.actor.id, a.personId, b.personId], facilitatorId: o.ctx.actor.id, rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00', firstScheduledAt: new Date(Date.now() + 3600_000) }))
  return { ...o, team, a, b, series: s.series, first: s.firstMeeting! }
}

describe('series', () => {
  it('creates from the template, custom agenda, ad-hoc, lists, updates and schedules next', async () => {
    const { ctx, team, series, first } = await setup()
    expect(series.templateKey).toBe('weekly')
    expect(series.agenda).toEqual(STANDARD_PACK.meetingTemplates![0]!.agenda)
    expect(first.scheduledAt.getTime()).toBeGreaterThan(Date.now())
    expect((await listMeetingTemplates(ctx)).map((t) => t.key)).toContain('weekly')
    const adhoc = ok(await execute(ctx, meetingSeriesCreate, { teamId: team.id, name: 'Ad hoc', agenda: [{ term: 'check_in', minutes: 5 }, { term: 'issue_solving', minutes: 30 }], rrule: null }))
    expect(adhoc.series).toMatchObject({ templateKey: 'custom', rrule: null })
    expect(adhoc.firstMeeting).toBeNull()
    await expect(execute(ctx, meetingScheduleNext, { seriesId: adhoc.series.id })).rejects.toMatchObject({ code: 'validation' })
    const when = new Date(Date.now() + 3 * 86_400_000)
    const m = ok(await execute(ctx, meetingScheduleNext, { seriesId: adhoc.series.id, scheduledAt: when }))
    expect(m.created).toBe(true)
    // weekly: the upcoming occurrence is reused rather than duplicated
    const again = ok(await execute(ctx, meetingScheduleNext, { seriesId: series.id }))
    expect(again).toMatchObject({ created: false })
    expect(again.meeting.id).toBe(first.id)
    await expect(execute(ctx, meetingSeriesCreate, { teamId: team.id, name: 'Bad', rrule: 'FREQ=DAILY' })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(ctx, meetingSeriesCreate, { teamId: team.id, name: 'Bad', templateKey: 'nope' })).rejects.toMatchObject({ code: 'validation' })
    expect((await listMeetingSeries(ctx, { teamId: team.id })).map((s) => s.name).sort()).toEqual(['Ad hoc', 'Leadership weekly'])
    expect((await getMeetingSeries(ctx, series.id)).upcoming).toHaveLength(1)
    expect(ok(await execute(ctx, meetingSeriesUpdate, { seriesId: series.id, name: 'LT weekly' })).name).toBe('LT weekly')
    expect((await listMeetings(ctx, { seriesId: series.id, status: 'upcoming' }))[0]).toMatchObject({ status: 'scheduled', seriesName: 'LT weekly' })
    expect((await getMeeting(ctx, first.id)).attendees).toHaveLength(3)
  })

  it('uses the org pack templates and computes timezone-aware occurrences', async () => {
    const o = await seedTestOrg(db)
    const team = (await listTeams(o.ctx))[0]!
    const pack = { ...STANDARD_PACK, id: 'test.pack', meetingTemplates: [{ key: 'level10', name: 'Level 10', agenda: [{ term: 'check_in', minutes: 5 }, { term: 'issue_solving', minutes: 60 }] }] }
    ok(await execute(o.ctx, orgSetTerminologyPack, { pack }))
    const s = ok(await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'L10', templateKey: 'level10' }))
    expect(s.series.agenda).toHaveLength(2)
    expect(zonedToUtc('2026-11-02', '09:00', 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z')
    const n = nextOccurrence('FREQ=WEEKLY;BYDAY=MO', '09:00', 'America/New_York', new Date('2026-11-02T15:00:00Z'))
    expect(n!.toISOString()).toBe('2026-11-09T14:00:00.000Z')
    expect(nextOccurrence(null, null, 'UTC', new Date())).toBeNull()
  })
})

describe('live meeting', () => {
  it('runs the full flow: start, presence, sections/timers, drop to issue, IDS, rate, end, history', async () => {
    const t = await setup()
    const { ctx, team, a, b, series, first } = t
    const sent: EmailMessage[] = []
    const sender: EmailSender = { send: async (m) => void sent.push(m) }

    // data for the meeting
    const [issue1, issue2, issue3] = [
      ok(await execute(ctx, issueCreate, { title: 'Issue one', teamId: team.id }))[0]!,
      ok(await execute(ctx, issueCreate, { title: 'Issue two', teamId: team.id }))[0]!,
      ok(await execute(ctx, issueCreate, { title: 'Issue three', teamId: team.id }))[0]!,
    ]
    const old1 = ok(await execute(ctx, todoCreate, { title: 'Old 1', teamId: team.id, ownerIds: [a.personId] }))[0]!
    const old2 = ok(await execute(ctx, todoCreate, { title: 'Old 2', teamId: team.id, ownerIds: [b.personId] }))[0]!
    const hl = ok(await execute(ctx, headlinePost, { text: 'Headline A', teamId: team.id }))[0]!

    expect((await getLiveState(ctx, first.id))!).toMatchObject({ status: 'scheduled', rev: 0 })
    const started = ok(await execute(ctx, meetingStart, { seriesId: series.id }))
    expect(started.id).toBe(first.id) // reuses the nearby scheduled occurrence ... or creates one
    await expect(execute(ctx, meetingStart, { meetingId: first.id })).rejects.toMatchObject({ code: 'conflict' })

    let st = (await getLiveState(ctx, first.id))!
    expect(st).toMatchObject({ status: 'live', sectionIndex: 0 })
    expect(st.agenda[0]!.running).toBe(true)
    expect(st.presence.map((p) => p.id)).toEqual([ctx.actor.id])
    expect(st.serverTime).toBeTruthy()

    // presence + polling
    await execute(a.ctx, meetingJoin, { meetingId: first.id })
    await execute(b.ctx, meetingJoin, { meetingId: first.id })
    const rev0 = (await getLiveState(ctx, first.id))!.rev
    expect(await getLiveState(ctx, first.id, { sinceRev: rev0 })).toBeNull()
    expect(await meetingHeartbeat(a.ctx, first.id)).toBe(true)
    expect(await getLiveState(ctx, first.id, { sinceRev: rev0 })).toBeNull() // heartbeat does not bump rev
    await execute(b.ctx, meetingLeave, { meetingId: first.id })
    const afterLeave = (await getLiveState(ctx, first.id, { sinceRev: rev0 }))!
    expect(afterLeave.rev).toBeGreaterThan(rev0)
    expect(afterLeave.presence.map((p) => p.id).sort()).toEqual([ctx.actor.id, a.personId].sort())

    // timers: next/set section, pause/resume accumulate
    await execute(ctx, meetingNextSection, { meetingId: first.id })
    await execute(ctx, meetingPause, { meetingId: first.id })
    st = (await getLiveState(ctx, first.id))!
    expect(st).toMatchObject({ status: 'paused', sectionIndex: 1 })
    expect(st.agenda[0]!.running).toBe(false)
    expect(st.agenda[1]!.running).toBe(false)
    await execute(ctx, meetingResume, { meetingId: first.id })
    expect((await getLiveState(ctx, first.id))!.agenda[1]!.running).toBe(true)
    await expect(execute(ctx, meetingSetSection, { meetingId: first.id, index: 99 })).rejects.toMatchObject({ code: 'validation' })
    await execute(ctx, meetingSetSection, { meetingId: first.id, index: 3 })

    // headline review; to-do tick -> pending, visible in counts and rev
    const revBefore = (await getLiveState(ctx, first.id))!.rev
    await execute(ctx, meetingReviewHeadline, { meetingId: first.id, headlineId: hl.id })
    expect(await listHeadlines(ctx, { teamId: team.id, reviewed: true })).toHaveLength(1)
    expect(ok(await execute(a.ctx, todoComplete, { todoId: old1.id })).status).toBe('pending')
    st = (await getLiveState(ctx, first.id))!
    expect(st.rev).toBeGreaterThan(revBefore)
    expect(st.counts).toMatchObject({ pendingTodos: 1, openTodos: 1, headlinesReviewed: 1 })

    // drop to issue (todo source), twice -> deduped
    const dropped = ok(await execute(ctx, meetingDropToIssue, { meetingId: first.id, from: { type: 'todo', id: old2.id } }))
    expect(dropped[0]).toMatchObject({ title: 'Old 2', source: { type: 'todo', id: old2.id }, teamId: team.id, ownerId: b.personId })
    const again = ok(await execute(ctx, meetingDropToIssue, { meetingId: first.id, from: { type: 'todo', id: old2.id } }))
    expect(again[0]!.id).toBe(dropped[0]!.id)

    // IDS
    await execute(ctx, meetingSetSettings, { meetingId: first.id, focusIssueCount: 2 })
    await expect(execute(ctx, idsFocus, { meetingId: first.id, issueIds: [issue1.id, issue2.id, issue3.id] })).rejects.toMatchObject({ code: 'validation' })
    await execute(ctx, idsFocus, { meetingId: first.id, issueIds: [issue1.id, issue2.id] })
    expect((await getLiveState(ctx, first.id))!.ids).toMatchObject({ status: 'prioritizing', focusIssueIds: [issue1.id, issue2.id] })
    await execute(ctx, idsStart, { meetingId: first.id })
    expect((await getLiveState(ctx, first.id))!.ids).toMatchObject({ status: 'discussing', currentIssueId: issue1.id })
    const res1 = ok(await execute(ctx, idsResolve, { meetingId: first.id, issueId: issue1.id, solved: true, todos: [{ title: 'Follow up', ownerId: a.personId }, { title: 'Write doc', ownerId: b.personId, dueDate: '2030-01-01' }] }))
    expect(res1.todoIds).toHaveLength(2)
    expect(res1.nextIssueId).toBe(issue2.id)
    const newTodo = await getTodo(ctx, res1.todoIds[0]!)
    expect(newTodo).toMatchObject({ status: 'open', teamId: team.id, source: { type: 'issue', id: issue1.id } })
    expect((await getIssue(ctx, issue1.id)).status).toBe('solved')
    await expect(execute(ctx, idsResolve, { meetingId: first.id, issueId: issue1.id, solved: true })).rejects.toMatchObject({ code: 'conflict' })
    await expect(execute(ctx, idsResolve, { meetingId: first.id, issueId: issue3.id, solved: true })).rejects.toMatchObject({ code: 'conflict' })
    ok(await execute(ctx, idsResolve, { meetingId: first.id, issueId: issue2.id, solved: false }))
    st = (await getLiveState(ctx, first.id))!
    expect(st.ids).toMatchObject({ status: 'complete', currentIssueId: null, solvedIssueIds: [issue1.id], discussedIssueIds: [issue1.id, issue2.id] })
    expect((await getIssue(ctx, issue2.id)).status).toBe('open')

    // capture by a notes agent
    const notes = await t.addAgent('Notes', ['read', 'write:meetings'])
    const cap = ok(await execute(notes.ctx, meetingCapture, { meetingId: first.id, todos: [{ title: 'Captured todo', ownerIds: [a.personId] }], issues: [{ title: 'Captured issue' }], headlines: [{ text: 'Captured headline' }] }))
    expect(cap.todos[0]).toMatchObject({ teamId: team.id, source: { type: 'meeting', id: first.id } })
    expect(cap.issues).toHaveLength(1)
    expect(cap.headlines).toHaveLength(1)
    expect((await getLiveState(ctx, first.id))!.newTodoIds).toHaveLength(3)

    // ratings: people only, 1-10, anonymous while live
    await expect(execute(notes.ctx, meetingRate, { meetingId: first.id, score: 9 })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(execute(ctx, meetingRate, { meetingId: first.id, score: 11 })).rejects.toMatchObject({ code: 'validation' })
    await execute(ctx, meetingRate, { meetingId: first.id, score: 9 })
    await execute(a.ctx, meetingRate, { meetingId: first.id, score: 7 })
    st = (await getLiveState(a.ctx, first.id))!
    expect(st.ratings).toMatchObject({ count: 2, mine: 7, average: 8, all: null })

    // end
    const r = await endMeeting(ctx, { meetingId: first.id }, { emailSender: sender })
    expect(r.ok).toBe(true)
    const end = ok(r)
    expect(end.stats).toMatchObject({ ratingAvg: 8, ratingCount: 2, issuesSolved: 1, issuesTotal: 2, newTodoCount: 3, invitedCount: 3, attendeeCount: 2 })
    // old1 (pending->done) and old2 (open) pre-existed: 1/2 done
    expect(end.stats.todosDone).toBe(1)
    expect(end.stats.todosTotal).toBe(2)
    expect(end.recapSent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toHaveLength(3)
    expect(sent[0]!.text).toContain('Follow up')
    expect(end.summary).toContain('Issues solved 1/2')

    // pending finalized, then cleared (done todos + reviewed headlines archived)
    await expect(getTodo(ctx, old1.id)).rejects.toMatchObject({ code: 'not_found' })
    expect((await listTodos(ctx, { teamId: team.id })).map((x) => x.title).sort()).toEqual(['Captured todo', 'Follow up', 'Old 2', 'Write doc'])
    expect((await listHeadlines(ctx, { teamId: team.id })).map((h) => h.text)).toEqual(['Captured headline'])
    expect(end.cleared).toEqual({ todos: 1, headlines: 1 })
    expect((await listIssues(ctx, { teamId: team.id })).map((i) => i.title)).toContain('Issue two')

    const final = (await getLiveState(ctx, first.id))!
    expect(final).toMatchObject({ status: 'ended', ratings: { all: { [ctx.actor.id]: 9, [a.personId]: 7 } } })
    expect(final.stats).toMatchObject({ issuesSolved: 1 })
    await expect(execute(ctx, meetingNextSection, { meetingId: first.id })).rejects.toMatchObject({ code: 'conflict' })
    await expect(execute(ctx, meetingEnd, { meetingId: first.id })).rejects.toMatchObject({ code: 'conflict' })

    const hist = await listMeetingHistory(ctx, { seriesId: series.id })
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ meetingId: first.id, ratingAvg: 8, issuesSolved: 1, issuesTotal: 2, todosDone: 1, todosTotal: 2, hasSummary: true })
    expect((await getMeeting(ctx, first.id)).recapSentAt).toBeTruthy()
  })

  it('keeps items when clearItems is off and skips the recap when sendRecap is off', async () => {
    const { ctx, team, series, first } = await setup()
    const sent: EmailMessage[] = []
    const t = ok(await execute(ctx, todoCreate, { title: 'Done already', teamId: team.id }))[0]!
    await execute(ctx, todoComplete, { todoId: t.id })
    ok(await execute(ctx, meetingStart, { meetingId: first.id }))
    await execute(ctx, meetingSetSettings, { meetingId: first.id, clearItems: false, sendRecap: false })
    const end = ok(await endMeeting(ctx, { meetingId: first.id }, { emailSender: { send: async (m) => void sent.push(m) } }))
    expect(sent).toHaveLength(0)
    expect(end.recap).toBeNull()
    expect((await getTodo(ctx, t.id)).status).toBe('done')
    expect(series.id).toBeTruthy()
  })

  it('creates the occurrence when starting a series without one', async () => {
    const o = await seedTestOrg(db)
    const team = (await listTeams(o.ctx))[0]!
    const s = ok(await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Adhoc', rrule: null }))
    const m = ok(await execute(o.ctx, meetingStart, { seriesId: s.series.id }))
    expect(m.startedAt).toBeTruthy()
    expect((await listMeetings(o.ctx, { status: 'live' }))).toHaveLength(1)
  })

  it('denies agents lacking write:meetings, isolates orgs and blocks viewers', async () => {
    const x = await setup()
    const y = await seedTestOrg(db)
    const ag = await x.addAgent('NoMeetings', ['read', 'write:todos'])
    await expect(execute(ag.ctx, meetingStart, { meetingId: x.first.id })).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(execute(y.ctx, meetingStart, { meetingId: x.first.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(getLiveState(y.ctx, x.first.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getMeeting(y.ctx, x.first.id)).rejects.toMatchObject({ code: 'not_found' })
    const noRead = await x.addAgent('NoRead', ['write:meetings'])
    await expect(getLiveState(noRead.ctx, x.first.id)).rejects.toMatchObject({ code: 'forbidden_scope' })
    const viewer = await x.addPerson('Vee', 'viewer')
    await expect(execute(viewer.ctx, meetingStart, { meetingId: x.first.id })).rejects.toMatchObject({ code: 'forbidden' })
    expect(await ctxForPerson(db, x.org.id, x.a.personId)).toBeTruthy()
  })

  it('prepares a pre-read', async () => {
    const { ctx, team, series, a } = await setup()
    ok(await execute(ctx, issueCreate, { title: 'Open one', teamId: team.id }))
    ok(await execute(ctx, todoCreate, { title: 'Late', teamId: team.id, ownerIds: [a.personId], dueDate: '2020-01-01' }))
    ok(await execute(ctx, todoCreate, { title: 'Not late', teamId: team.id, dueDate: '2099-01-01' }))
    ok(await execute(ctx, headlinePost, { text: 'Fresh', teamId: team.id }))
    const prep = await prepareMeeting(ctx, { seriesId: series.id })
    expect(prep.openIssues.map((i) => i.title)).toEqual(['Open one'])
    expect(prep.overdueTodos.map((i) => i.title)).toEqual(['Late'])
    expect(prep.headlinesToReview.map((h) => h.text)).toEqual(['Fresh'])
    expect(prep.offTrackMetrics).toEqual([])
    expect(prep.offTrackPriorities).toEqual([])
    await expect(prepareMeeting(ctx, {})).rejects.toMatchObject({ code: 'validation' })
  })
})
