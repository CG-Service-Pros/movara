import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditEvents, type DbHandle } from '@motion/db'
import { STANDARD_PACK } from '@motion/terminology'
import {
  approveApproval, chartProposeChange, endMeeting, execute, getLiveState, getMeeting, getOrg, getScorecard, getTerms, getVision,
  headlinePost, idsFocus, idsSetStep, idsStart, issueCreate, issueSolve, listActivity, listIssues, listMeetings, listTeams, listTodos, meetingCapture, meetingSeriesCreate,
  meetingSetShared, meetingStart, metricCreate, metricRecordValues, metricUpdate, milestoneAdd, milestoneToggle, milestoneUpdate, orgSetTerminologyPack, priorityCreate,
  scorecardCreate, sectionsOf, todoComplete, todoCreate, visionProposeChange, getChart, milestoneDelete, renderRecapHtml, type EmailMessage,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}

describe('scorecard cells expose provenance (gap 1) and metric description (gap 2)', () => {
  it('returns enteredByActor + updatedAt per cell, null for empty cells', async () => {
    const t = await seedTestOrg(db)
    const team = (await listTeams(t.ctx))[0]!
    const sc = ok(await execute(t.ctx, scorecardCreate, { teamId: team.id }))
    const m = ok(await execute(t.ctx, metricCreate, { scorecardId: sc.id, title: 'Leads', goal: 10, description: '  Qualified leads per week  ' }))
    expect(m.description).toBe('Qualified leads per week')
    const agent = await t.addAgent('Sales', ['read', 'write:metrics'], t.ctx.actor.id)
    await execute(agent.ctx, metricRecordValues, { scorecardId: sc.id, values: [{ metricId: m.id, periodStart: '2026-11-02', value: 12 }] })
    await execute(t.ctx, metricRecordValues, { scorecardId: sc.id, values: [{ metricId: m.id, periodStart: '2026-10-26', value: 8 }] })
    const v = await getScorecard(t.ctx, { scorecardId: sc.id, asOf: '2026-11-04', periods: 3 })
    const cells = v.metrics[0]!.cells
    expect(v.metrics[0]!.description).toBe('Qualified leads per week')
    expect(cells[0]).toMatchObject({ value: null, enteredByActor: null, updatedAt: null })
    expect(cells[1]).toMatchObject({ value: 8, enteredByActor: { type: 'person', id: t.ctx.actor.id } })
    expect(cells[2]).toMatchObject({ value: 12, enteredByActor: { type: 'agent', id: agent.agentId, onBehalfOf: t.ctx.actor.id } })
    expect(cells[2]!.updatedAt).toBeInstanceOf(Date)
  })

  it('updates and clears the description', async () => {
    const t = await seedTestOrg(db)
    const team = (await listTeams(t.ctx))[0]!
    const sc = ok(await execute(t.ctx, scorecardCreate, { teamId: team.id }))
    const m = ok(await execute(t.ctx, metricCreate, { scorecardId: sc.id, title: 'NPS', goal: 50 }))
    expect(m.description).toBeNull()
    expect(ok(await execute(t.ctx, metricUpdate, { metricId: m.id, description: 'Survey score' })).description).toBe('Survey score')
    expect(ok(await execute(t.ctx, metricUpdate, { metricId: m.id, title: 'NPS 2' })).description).toBe('Survey score') // untouched
    expect(ok(await execute(t.ctx, metricUpdate, { metricId: m.id, description: null })).description).toBeNull()
    expect(ok(await execute(t.ctx, metricUpdate, { metricId: m.id, description: 'x' })).description).toBe('x')
    expect(ok(await execute(t.ctx, metricUpdate, { metricId: m.id, description: '' })).description).toBeNull()
  })
})

describe('list filters accept one status or several (gap 3)', () => {
  it('listTodos and listIssues', async () => {
    const t = await seedTestOrg(db)
    ok(await execute(t.ctx, todoCreate, { title: 'A' }))
    const b = ok(await execute(t.ctx, todoCreate, { title: 'B' }))[0]!
    await execute(t.ctx, todoComplete, { todoId: b.id })
    expect((await listTodos(t.ctx, { status: 'open' })).map((x) => x.title)).toEqual(['A'])
    expect((await listTodos(t.ctx, { status: ['open', 'done'] })).map((x) => x.title).sort()).toEqual(['A', 'B'])

    const i1 = ok(await execute(t.ctx, issueCreate, { title: 'I1' }))[0]!
    const i2 = ok(await execute(t.ctx, issueCreate, { title: 'I2' }))[0]!
    ok(await execute(t.ctx, issueSolve, { issueId: i2.id }))
    expect((await listIssues(t.ctx)).map((x) => x.title)).toEqual(['I1'])
    expect((await listIssues(t.ctx, { status: 'solved' })).map((x) => x.title)).toEqual(['I2'])
    expect((await listIssues(t.ctx, { status: ['open', 'solved'] })).map((x) => x.title).sort()).toEqual(['I1', 'I2'])
    expect((await listIssues(t.ctx, { status: 'all' })).map((x) => x.id).sort()).toEqual([i1.id, i2.id].sort())
    expect(await listIssues(t.ctx, { status: ['dropped'] })).toEqual([])
  })
})

describe('listActivity (gap 4)', () => {
  it('returns a priority plus its milestone events, newest first, with the milestone title in the diff', async () => {
    const t = await seedTestOrg(db)
    const p = ok(await execute(t.ctx, priorityCreate, { title: 'Ship it', milestones: [] }))
    const other = ok(await execute(t.ctx, priorityCreate, { title: 'Other', milestones: [] }))
    const m = ok(await execute(t.ctx, milestoneAdd, { priorityId: p.id, title: 'Beta' }))
    const om = ok(await execute(t.ctx, milestoneAdd, { priorityId: other.id, title: 'Unrelated' }))
    await execute(t.ctx, milestoneToggle, { milestoneId: m.id, done: true })
    await execute(t.ctx, milestoneUpdate, { milestoneId: m.id, title: 'Beta 2' })
    await execute(t.ctx, milestoneUpdate, { milestoneId: m.id, dueDate: '2030-01-01' })
    await execute(t.ctx, milestoneDelete, { milestoneId: m.id })
    await execute(t.ctx, milestoneToggle, { milestoneId: om.id, done: true })

    const all = await listActivity(t.ctx, { entityType: 'priority', entityId: p.id })
    expect(all.map((e) => e.command)).toEqual(['milestone.delete', 'milestone.update', 'milestone.update', 'milestone.toggle', 'milestone.add', 'priority.create'])
    const toggle = all.find((e) => e.command === 'milestone.toggle')!
    expect(toggle.diff).toMatchObject({ milestoneTitle: 'Beta', priorityId: p.id, after: { doneAt: expect.anything() } })
    expect(all.find((e) => e.command === 'milestone.delete')!.diff).toMatchObject({ milestoneTitle: 'Beta 2' })
    expect(all.some((e) => e.entityId === om.id)).toBe(false)

    const own = await listActivity(t.ctx, { entityType: 'priority', entityId: p.id, includeChildren: false })
    expect(own.map((e) => e.command)).toEqual(['priority.create'])
    expect(await listActivity(t.ctx, { entityType: 'milestone', entityId: m.id, limit: 2 })).toHaveLength(2)
  })

  it('is org scoped', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const p = ok(await execute(a.ctx, priorityCreate, { title: 'Mine', milestones: [] }))
    expect(await listActivity(b.ctx, { entityType: 'priority', entityId: p.id })).toEqual([])
  })
})

describe('meetings (gap 5)', () => {
  async function liveSetup() {
    const t = await seedTestOrg(db)
    const team = (await listTeams(t.ctx))[0]!
    const alice = await t.addPerson('Alice')
    const scribe = await t.addAgent('Notes Agent', ['read', 'write:meetings', 'write:todos', 'write:issues', 'write:headlines'], t.ctx.actor.id)
    const created = ok(await execute(t.ctx, meetingSeriesCreate, {
      teamId: team.id, name: 'Weekly', attendeeIds: [t.ctx.actor.id, alice.personId], rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00',
      firstScheduledAt: new Date(Date.now() + 3600_000), scribeActor: { type: 'agent', id: scribe.agentId, onBehalfOf: t.ctx.actor.id },
    }))
    return { ...t, team, alice, scribe, series: created.series, first: created.firstMeeting! }
  }

  it('items created by any path while the meeting is live are added to its state', async () => {
    const { ctx, team, alice, scribe, first } = await liveSetup()
    // before start: nothing is recorded
    ok(await execute(ctx, todoCreate, { title: 'Before', teamId: team.id }))
    await execute(ctx, meetingStart, { meetingId: first.id })
    expect((await getLiveState(ctx, first.id))!.newTodoIds).toEqual([])
    const rev0 = (await getLiveState(ctx, first.id))!.rev

    const todo = ok(await execute(ctx, todoCreate, { title: 'UI todo', teamId: team.id }))[0]!
    const agentTodos = ok(await execute(scribe.ctx, todoCreate, { title: 'Agent todo', teamId: team.id, ownerIds: [ctx.actor.id, alice.personId] }))
    const issue = ok(await execute(scribe.ctx, issueCreate, { title: 'Agent issue', teamId: team.id }))[0]!
    const hl = ok(await execute(alice.ctx, headlinePost, { text: 'Good news', teamId: team.id }))[0]!
    const personal = ok(await execute(ctx, todoCreate, { title: 'Personal' }))[0]! // no team: not a meeting item

    const st = (await getLiveState(ctx, first.id))!
    expect(st.newTodoIds).toEqual([todo.id, ...agentTodos.map((x) => x.id)])
    expect(st.newTodoIds).not.toContain(personal.id)
    expect(st.ids.addedIssueIds).toEqual([issue.id])
    expect(st.newHeadlineIds).toEqual([hl.id])
    expect(st.rev).toBeGreaterThan(rev0)
    expect(st.counts.newTodos).toBe(3)

    // meeting.capture does not double count
    await execute(scribe.ctx, meetingCapture, { meetingId: first.id, todos: [{ title: 'Captured' }] })
    expect((await getLiveState(ctx, first.id))!.newTodoIds).toHaveLength(4)

    // other teams' meetings are untouched
    const end = ok(await endMeeting(ctx, { meetingId: first.id }, { emailSender: { send: async () => {} } }))
    expect(end.stats.newTodoCount).toBe(4)
  })

  it('start adds the scribe agent to presence; end schedules the next occurrence of a recurring series', async () => {
    const { ctx, scribe, series, first } = await liveSetup()
    await execute(ctx, meetingStart, { meetingId: first.id })
    const st = (await getLiveState(ctx, first.id))!
    expect(st.presence.map((p) => p.id).sort()).toEqual([ctx.actor.id, scribe.agentId].sort())
    expect(st.presence.find((p) => p.id === scribe.agentId)).toMatchObject({ kind: 'agent', name: 'Notes Agent', onBehalfOf: ctx.actor.id })

    const sent: EmailMessage[] = []
    const end = ok(await endMeeting(ctx, { meetingId: first.id }, { emailSender: { send: async (m) => { sent.push(m) } } }))
    expect(end.nextMeeting).toBeTruthy()
    const upcoming = await listMeetings(ctx, { seriesId: series.id, status: 'upcoming' })
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]!.id).toBe(end.nextMeeting!.id)
    expect(upcoming[0]!.id).not.toBe(first.id)
    // recap carries an HTML body with the org wordmark and terms
    expect(sent[0]!.html).toContain('Weekly recap')
  })

  it('ad-hoc series do not schedule a next occurrence', async () => {
    const t = await seedTestOrg(db)
    const team = (await listTeams(t.ctx))[0]!
    const s = ok(await execute(t.ctx, meetingSeriesCreate, { teamId: team.id, name: 'One-off', rrule: null, firstScheduledAt: new Date(Date.now() + 3600_000) }))
    await execute(t.ctx, meetingStart, { meetingId: s.firstMeeting!.id })
    const end = ok(await endMeeting(t.ctx, { meetingId: s.firstMeeting!.id }))
    expect(end.nextMeeting).toBeNull()
    expect(await listMeetings(t.ctx, { seriesId: s.series.id, status: 'upcoming' })).toHaveLength(0)
  })

  it('IDS step is explicit state with a command; check-in shared flags are stored', async () => {
    const { ctx, team, alice, first } = await liveSetup()
    const i1 = ok(await execute(ctx, issueCreate, { title: 'I1', teamId: team.id }))[0]!
    await execute(ctx, meetingStart, { meetingId: first.id })
    expect((await getLiveState(ctx, first.id))!.ids.step).toBe('identify')
    // no current issue yet: only identify
    await expect(execute(ctx, idsSetStep, { meetingId: first.id, step: 'solve' })).rejects.toMatchObject({ code: 'conflict' })
    await execute(ctx, idsFocus, { meetingId: first.id, issueIds: [i1.id] })
    await execute(ctx, idsStart, { meetingId: first.id })
    expect((await getLiveState(ctx, first.id))!.ids).toMatchObject({ currentIssueId: i1.id, step: 'discuss' })
    await execute(alice.ctx, idsSetStep, { meetingId: first.id, step: 'solve' })
    expect((await getLiveState(ctx, first.id))!.ids.step).toBe('solve')
    await expect(execute(ctx, idsSetStep, { meetingId: first.id, step: 'nope' as never })).rejects.toMatchObject({ code: 'validation' })
    await execute(ctx, idsFocus, { meetingId: first.id, issueIds: [] }) // no current issue again
    expect((await getLiveState(ctx, first.id))!.ids.step).toBe('identify')

    expect((await getLiveState(ctx, first.id))!.sharedIds).toEqual([])
    await execute(ctx, meetingSetShared, { meetingId: first.id, personId: alice.personId, shared: true })
    await execute(ctx, meetingSetShared, { meetingId: first.id, personId: alice.personId, shared: true })
    expect((await getLiveState(alice.ctx, first.id))!.sharedIds).toEqual([alice.personId])
    await execute(ctx, meetingSetShared, { meetingId: first.id, personId: alice.personId, shared: false })
    expect((await getLiveState(ctx, first.id))!.sharedIds).toEqual([])
    expect((await getMeeting(ctx, first.id)).status).toBe('live')
  })
})

describe('recap html', () => {
  it('escapes content, uses the accent and terms', () => {
    const html = renderRecapHtml({
      orgName: 'Acme <Inc>', wordmark: 'acme', accent: '#ff0000', seriesName: 'L10', date: '2026-11-02',
      stats: { durationMinutes: 60, ratingAvg: 8.5, ratingCount: 2, issuesSolved: 1, issuesTotal: 2, todosDone: 1, todosTotal: 2, attendeeCount: 2, invitedCount: 3, newTodoCount: 1 },
      solved: ['Fix <b>it</b>'], newTodos: [{ title: 'Ship', owner: 'Ann', dueDate: '2026-11-09' }],
      labels: { issues: 'Issues', todos: 'To-Dos', newTodos: 'New to-dos', solved: 'Solved', rating: 'Rating', duration: 'Duration', attendance: 'Attendance' },
    })
    expect(html).toContain('#ff0000')
    expect(html).toContain('acme')
    expect(html).toContain('Fix &lt;b&gt;it&lt;/b&gt;')
    expect(html).toContain('Issues solved')
    expect(html).not.toContain('<b>it</b>')
    expect(renderRecapHtml({ ...{ orgName: 'x', seriesName: 'y', date: 'z', stats: { durationMinutes: 1, ratingAvg: null, ratingCount: 0, issuesSolved: 0, issuesTotal: 0, todosDone: 0, todosTotal: 0, attendeeCount: 0, invitedCount: 0, newTodoCount: 0 }, solved: [], newTodos: [], labels: { issues: 'I', todos: 'T', newTodos: 'N', solved: 'S', rating: 'R', duration: 'D', attendance: 'A' } }, accent: 'red;' })).toContain('#3b5bdb')
  })
})

describe('approvedBy is passed to the re-executed command (gap 6)', () => {
  it('vision goals store approvedBy at approval time (no read-time lookup needed)', async () => {
    const t = await seedTestOrg(db)
    const admin = await t.addPerson('Ada', 'admin')
    const agent = await t.addAgent('Notes', ['read', 'propose:vision'], t.ctx.actor.id)
    const r = await execute(agent.ctx, visionProposeChange, { section: 'one_year_plan', op: 'add_goal', text: 'Win partners' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    await approveApproval(admin.ctx, r.approvalId)
    const goal = sectionsOf((await getVision(t.ctx)).published!).oneYear!.goals[0]!
    expect(goal.provenance).toMatchObject({ approvalId: r.approvalId, approvedBy: { type: 'person', id: admin.personId }, proposedBy: { type: 'agent', id: agent.agentId } })
    // stored in the revision content itself
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.entityType, 'vision_revision'))
    expect(audits.some((a) => (a.diff as { approvedBy?: { id: string } } | null)?.approvedBy?.id === admin.personId)).toBe(true)
  })

  it('chart audit carries approvedBy', async () => {
    const t = await seedTestOrg(db)
    const agent = await t.addAgent('Chart bot', ['read', 'propose:chart'], t.ctx.actor.id)
    const r = await execute(agent.ctx, chartProposeChange, { ops: [{ op: 'add_seat', title: 'CEO' }] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    await approveApproval(t.ctx, r.approvalId)
    expect((await getChart(t.ctx)).published!.seatCount).toBe(1)
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.command, 'chart.propose_change'))
    expect(rows[0]!.diff).toMatchObject({ approvalId: r.approvalId, approvedBy: { type: 'person', id: t.ctx.actor.id } })
  })
})

describe('terminology history (gap 7)', () => {
  const pack = (id: string, name: string, plural: string) => ({
    id, name, version: '1.0.0', format: 1, locale: 'en', terms: { priority: { singular: plural.slice(0, -1), plural } },
  })
  it('revert walks back through every applied pack; Use Standard is a step on the stack', async () => {
    const t = await seedTestOrg(db)
    const active = async () => (await getOrg(t.ctx)).terminologyPack?.id ?? 'standard'
    await expect(execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })).rejects.toMatchObject({ code: 'conflict' })
    await execute(t.ctx, orgSetTerminologyPack, { pack: pack('pack.a', 'Pack A', 'Aces') })
    await execute(t.ctx, orgSetTerminologyPack, { pack: pack('pack.b', 'Pack B', 'Bees') })
    await execute(t.ctx, orgSetTerminologyPack, { pack: pack('pack.b', 'Pack B', 'Bees') }) // re-applying the same pack adds no step
    expect(await active()).toBe('pack.b')
    expect((await getTerms(t.ctx)).t('priority', 'plural')).toBe('Bees')

    await execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })
    expect(await active()).toBe('pack.a')
    await execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })
    expect(await active()).toBe('standard')
    expect((await getTerms(t.ctx)).t('priority', 'plural')).toBe(STANDARD_PACK.terms.priority!.plural)
    await expect(execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })).rejects.toMatchObject({ code: 'conflict' })

    // apply A, then Use Standard: revert goes back to A, and from there to Standard
    await execute(t.ctx, orgSetTerminologyPack, { pack: pack('pack.a', 'Pack A', 'Aces') })
    await execute(t.ctx, orgSetTerminologyPack, { pack: null })
    expect(await active()).toBe('standard')
    await execute(t.ctx, orgSetTerminologyPack, { pack: null }) // already Standard: nothing new to revert to
    await execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })
    expect(await active()).toBe('pack.a')
    await execute(t.ctx, orgSetTerminologyPack, { pack: null, revert: true })
    expect(await active()).toBe('standard')
  })
})
