import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { todayIn } from '../calendar'
import { z } from 'zod'
import { agents, headlines, issues, meetings, metrics, orgs, people, priorities, todos, type ActorJson } from '@movara/db'
import { requireRole, requireScope, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { base, found, scoped, softDelete, touch } from '../helpers'
import { dateSchema, insertIssues, sourceSchema } from '../issues/internal'
import { insertHeadlines } from '../headlines/internal'
import { insertTodos } from '../todos/internal'
import { defineCommand, execute, type ExecuteOptions, type ExecuteResult } from '../runner'
import { getEmailSender, type EmailSender } from './email'
import { renderRecapHtml } from './recap-html'
import { createTerms } from '../terminology'
import { findLiveMeetingIds } from './live'
import { createNextOccurrence } from './series'
import { loadMeeting, requireLive, saveState, startTimer, stopTimer, type Loaded } from './state'
import type { MeetingStats, PresenceEntry } from './types'
import { meetingSeries } from '@movara/db'

const meetingId = z.uuid()
const out = (l: Loaded, after: Record<string, unknown> | null = null) => ({
  data: l.meeting,
  entity: { type: 'meeting', id: l.meeting.id },
  before: null,
  after: after ?? { rev: l.state.rev },
})

async function presenceFor(ctx: Ctx, now: Date, actor: ActorJson = ctx.actor): Promise<PresenceEntry> {
  const at = now.toISOString()
  if (actor.type === 'agent') {
    const [a] = await ctx.db.select({ name: agents.name, owner: agents.ownerPersonId }).from(agents).where(and(eq(agents.orgId, ctx.orgId), eq(agents.id, actor.id))).limit(1)
    return { kind: 'agent', id: actor.id, name: a?.name ?? 'Agent', onBehalfOf: actor.onBehalfOf ?? a?.owner ?? undefined, joinedAt: at, lastSeen: at }
  }
  const [p] = await ctx.db.select({ name: people.name }).from(people).where(scoped(people, ctx, eq(people.id, actor.id))).limit(1)
  return { kind: 'person', id: actor.id, name: p?.name ?? 'Member', joinedAt: at, lastSeen: at }
}

// ---------------------------------------------------------------- start / presence

export const meetingStart = defineCommand({
  name: 'meeting.start',
  scope: 'write:meetings',
  input: z.object({ meetingId: meetingId.optional(), seriesId: z.uuid().optional() }).refine((i) => !!i.meetingId !== !!i.seriesId, { message: 'Provide meetingId or seriesId' }),
  run: async (ctx, input) => {
    const now = new Date()
    let id = input.meetingId
    if (!id) {
      const [series] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, input.seriesId!))).limit(1)
      found(series, 'Meeting series')
      const open = await ctx.db
        .select()
        .from(meetings)
        .where(scoped(meetings, ctx, eq(meetings.seriesId, series!.id), sql`${meetings.startedAt} is null`, sql`${meetings.endedAt} is null`))
        .orderBy(asc(meetings.scheduledAt))
      const near = open
        .filter((m) => Math.abs(m.scheduledAt.getTime() - now.getTime()) <= 18 * 3600_000)
        .sort((a, b) => Math.abs(a.scheduledAt.getTime() - now.getTime()) - Math.abs(b.scheduledAt.getTime() - now.getTime()))[0]
      id = near ? near.id : (await createNextOccurrence(ctx, series!, now)).meeting.id
    }
    const l = await loadMeeting(ctx, id, true)
    if (l.meeting.endedAt) throw new MovaraError('conflict', 'The meeting has ended')
    if (l.meeting.startedAt) throw new MovaraError('conflict', 'The meeting has already started')
    if ((await findLiveMeetingIds(ctx, [l.series.teamId])).length) throw new MovaraError('conflict', 'Another meeting of this team is already live')
    const s = l.state
    s.agenda = l.series.agenda
    s.sectionIndex = 0
    s.paused = false
    s.timers = {}
    startTimer(s, 0, now)
    const me = await presenceFor(ctx, now)
    s.presence = { [me.id]: me }
    // The series' scribe agent (note-taker) is part of the room from the start.
    const scribe = l.series.scribeActor
    if (scribe?.type === 'agent' && scribe.id !== me.id) s.presence[scribe.id] = await presenceFor(ctx, now, scribe)
    await saveState(ctx, l, { startedAt: now })
    return out(l)
  },
})

export const meetingJoin = defineCommand({
  name: 'meeting.join',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const now = new Date()
    const mine = l.state.presence[ctx.actor.id]
    if (mine) mine.lastSeen = now.toISOString()
    else l.state.presence[ctx.actor.id] = await presenceFor(ctx, now)
    await saveState(ctx, l)
    return out(l)
  },
})

export const meetingLeave = defineCommand({
  name: 'meeting.leave',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    delete l.state.presence[ctx.actor.id]
    await saveState(ctx, l)
    return out(l)
  },
})

/** Lightweight presence ping (no audit row, no rev bump). Returns false when the actor is not in the meeting. */
export async function meetingHeartbeat(ctx: Ctx, id: string): Promise<boolean> {
  requireScope(ctx, 'write:meetings')
  requireRole(ctx, 'member')
  const rows = await ctx.db
    .update(meetings)
    .set({ state: sql`jsonb_set(${meetings.state}, ARRAY['presence', ${ctx.actor.id}::text, 'lastSeen'], to_jsonb(${new Date().toISOString()}::text), false)` })
    .where(scoped(meetings, ctx, eq(meetings.id, id), isNotNull(meetings.startedAt), sql`${meetings.endedAt} is null`, sql`${meetings.state}->'presence' ? ${ctx.actor.id}::text`))
    .returning({ id: meetings.id })
  return rows.length > 0
}

// ---------------------------------------------------------------- sections / timers

function goToSection(l: Loaded, index: number, now: Date) {
  const s = l.state
  stopTimer(s, s.sectionIndex, now)
  s.sectionIndex = index
  startTimer(s, index, now)
}

export const meetingNextSection = defineCommand({
  name: 'meeting.next_section',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    if (l.state.sectionIndex >= l.state.agenda.length - 1) throw new MovaraError('conflict', 'This is the last section; end the meeting')
    goToSection(l, l.state.sectionIndex + 1, new Date())
    await saveState(ctx, l)
    return out(l, { sectionIndex: l.state.sectionIndex })
  },
})

export const meetingSetSection = defineCommand({
  name: 'meeting.set_section',
  scope: 'write:meetings',
  input: z.object({ meetingId, index: z.number().int().min(0) }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    if (input.index >= l.state.agenda.length) throw new MovaraError('validation', `Section index out of range (0..${l.state.agenda.length - 1})`)
    if (input.index !== l.state.sectionIndex) goToSection(l, input.index, new Date())
    await saveState(ctx, l)
    return out(l, { sectionIndex: l.state.sectionIndex })
  },
})

export const meetingPause = defineCommand({
  name: 'meeting.pause',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    if (!l.state.paused) {
      stopTimer(l.state, l.state.sectionIndex, new Date())
      l.state.paused = true
      await saveState(ctx, l)
    }
    return out(l, { paused: true })
  },
})

export const meetingResume = defineCommand({
  name: 'meeting.resume',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    if (l.state.paused) {
      l.state.paused = false
      startTimer(l.state, l.state.sectionIndex, new Date())
      await saveState(ctx, l)
    }
    return out(l, { paused: false })
  },
})

// ---------------------------------------------------------------- drop to issue / headlines

const dropSource = z.object({ type: z.enum(['metric', 'priority', 'headline', 'todo']), id: z.uuid() })

/** "Drop to IDS": create an issue from a metric, priority, headline or to-do (structured `source`). */
export const meetingDropToIssue = defineCommand({
  name: 'meeting.drop_to_issue',
  scope: 'write:meetings',
  input: z.object({ meetingId, from: dropSource, title: z.string().trim().min(1).max(300).optional(), ownerIds: z.array(z.uuid()).max(50).optional() }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const { type, id } = input.from
    let title: string
    let owner: string | null = null
    if (type === 'metric') {
      const [r] = await ctx.db.select().from(metrics).where(scoped(metrics, ctx, eq(metrics.id, id))).limit(1)
      found(r, 'Metric')
      title = `${r!.title} is off track`
      owner = r!.ownerIds[0] ?? null
    } else if (type === 'priority') {
      const [r] = await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.id, id))).limit(1)
      found(r, 'Priority')
      title = `${r!.title} is off track`
      owner = r!.ownerId
    } else if (type === 'headline') {
      const [r] = await ctx.db.select().from(headlines).where(scoped(headlines, ctx, eq(headlines.id, id))).limit(1)
      found(r, 'Headline')
      title = r!.text
      owner = r!.ownerId
    } else {
      const [r] = await ctx.db.select().from(todos).where(scoped(todos, ctx, eq(todos.id, id))).limit(1)
      found(r, 'To-do')
      title = r!.title
      owner = r!.ownerId
    }
    // Do not duplicate: an open issue already dropped from this item in this team is reused.
    const [dup] = await ctx.db
      .select()
      .from(issues)
      .where(scoped(issues, ctx, eq(issues.status, 'open'), eq(issues.teamId, l.series.teamId), sql`${issues.source}->>'type' = ${type}`, sql`${issues.source}->>'id' = ${id}`))
      .limit(1)
    const rows = dup && !input.ownerIds ? [dup] : await insertIssues(ctx, { title: input.title ?? title, ownerIds: input.ownerIds ?? (owner ? [owner] : undefined), teamId: l.series.teamId, source: { type, id } })
    for (const r of rows) if (!l.state.idsState.addedIssueIds.includes(r.id)) l.state.idsState.addedIssueIds.push(r.id)
    await saveState(ctx, l)
    return { data: rows, entity: { type: 'issue', id: rows[0]!.id }, before: null, after: { meetingId: l.meeting.id, source: input.from, issueIds: rows.map((r) => r.id) } }
  },
})

export const meetingReviewHeadline = defineCommand({
  name: 'meeting.review_headline',
  scope: 'write:meetings',
  input: z.object({ meetingId, headlineId: z.uuid() }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const [h] = await ctx.db.select().from(headlines).where(scoped(headlines, ctx, eq(headlines.id, input.headlineId))).limit(1)
    found(h, 'Headline')
    const [row] = await ctx.db.update(headlines).set({ reviewedAt: h!.reviewedAt ?? new Date(), ...touch(headlines, ctx) }).where(scoped(headlines, ctx, eq(headlines.id, h!.id))).returning()
    if (!l.state.reviewedHeadlineIds.includes(h!.id)) l.state.reviewedHeadlineIds.push(h!.id)
    await saveState(ctx, l)
    return { data: row!, entity: { type: 'headline', id: h!.id }, before: { reviewedAt: h!.reviewedAt }, after: { reviewedAt: row!.reviewedAt, meetingId: l.meeting.id } }
  },
})

// ---------------------------------------------------------------- IDS

export const idsFocus = defineCommand({
  name: 'ids.focus',
  scope: 'write:meetings',
  input: z.object({ meetingId, /** The issues to discuss next (replaces the not-yet-discussed picks), up to settings.focusIssueCount. */ issueIds: z.array(z.uuid()).max(20) }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const ids = l.state.idsState
    const picks = [...new Set(input.issueIds)].filter((i) => !ids.discussedIssueIds.includes(i))
    if (picks.length > l.state.settings.focusIssueCount) throw new MovaraError('validation', `At most ${l.state.settings.focusIssueCount} focus issues`)
    if (picks.length) {
      const rows = await ctx.db.select().from(issues).where(scoped(issues, ctx, inArray(issues.id, picks)))
      if (rows.length !== picks.length) throw new MovaraError('not_found', 'Issue not found')
      if (rows.some((r) => r.status !== 'open')) throw new MovaraError('conflict', 'Only open issues can be discussed')
    }
    l.state.focusIssueIds = [...l.state.focusIssueIds.filter((i) => ids.discussedIssueIds.includes(i)), ...picks]
    if (ids.currentIssueId && !picks.includes(ids.currentIssueId)) ids.currentIssueId = null
    ids.status = ids.currentIssueId ? 'discussing' : picks.length ? 'prioritizing' : ids.discussedIssueIds.length ? 'complete' : 'idle'
    if (!ids.currentIssueId) ids.step = 'identify'
    await saveState(ctx, l)
    return out(l, { focusIssueIds: l.state.focusIssueIds })
  },
})

export const idsStart = defineCommand({
  name: 'ids.start',
  scope: 'write:meetings',
  input: z.object({ meetingId, /** Default: the first focus issue not yet discussed. */ issueId: z.uuid().optional() }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const ids = l.state.idsState
    const pending = l.state.focusIssueIds.filter((i) => !ids.discussedIssueIds.includes(i))
    const issueId = input.issueId ?? pending[0]
    if (!issueId || !pending.includes(issueId)) throw new MovaraError('conflict', 'Pick focus issues first (ids.focus), then start one that has not been discussed')
    ids.currentIssueId = issueId
    ids.status = 'discussing'
    ids.step = 'discuss'
    await saveState(ctx, l)
    return out(l, { currentIssueId: issueId })
  },
})

export const idsResolve = defineCommand({
  name: 'ids.resolve',
  scope: 'write:meetings',
  input: z.object({
    meetingId,
    issueId: z.uuid(),
    solved: z.boolean(),
    todos: z.array(z.object({ title: z.string().trim().min(1).max(300), ownerId: z.uuid(), dueDate: dateSchema.optional() })).max(20).optional(),
  }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const s = l.state
    const ids = s.idsState
    if (!s.focusIssueIds.includes(input.issueId)) throw new MovaraError('conflict', 'The issue is not a focus issue of this meeting')
    if (ids.discussedIssueIds.includes(input.issueId)) throw new MovaraError('conflict', 'The issue was already resolved in this meeting')
    const [issue] = await ctx.db.select().from(issues).where(scoped(issues, ctx, eq(issues.id, input.issueId))).limit(1)
    found(issue, 'Issue')
    if (issue!.status !== 'open') throw new MovaraError('conflict', 'Only open issues can be resolved')
    const todoIds: string[] = []
    for (const t of input.todos ?? []) {
      const [row] = await insertTodos(ctx, { title: t.title, ownerIds: [t.ownerId], dueDate: t.dueDate, teamId: l.series.teamId, source: { type: 'issue', id: input.issueId } })
      todoIds.push(row!.id)
    }
    if (input.solved) await ctx.db.update(issues).set({ status: 'solved', solvedAt: new Date(), ...touch(issues, ctx) }).where(scoped(issues, ctx, eq(issues.id, input.issueId)))
    ids.discussedIssueIds.push(input.issueId)
    if (input.solved) ids.solvedIssueIds.push(input.issueId)
    ids.resolutions[input.issueId] = { solved: input.solved, todoIds }
    s.newTodoIds.push(...todoIds)
    const next = s.focusIssueIds.find((i) => !ids.discussedIssueIds.includes(i)) ?? null
    ids.currentIssueId = next
    ids.status = next ? 'discussing' : 'complete'
    ids.step = next ? 'discuss' : 'identify'
    await saveState(ctx, l)
    return { data: { meeting: l.meeting, todoIds, nextIssueId: next }, entity: { type: 'issue', id: input.issueId }, before: { status: 'open' }, after: { status: input.solved ? 'solved' : 'open', meetingId: l.meeting.id, todoIds } }
  },
})

/** Move the IDS stepper (Identify, Discuss, Solve). Identify is the only step available without a current issue. */
export const idsSetStep = defineCommand({
  name: 'ids.set_step',
  scope: 'write:meetings',
  input: z.object({ meetingId, step: z.enum(['identify', 'discuss', 'solve']) }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    if (input.step !== 'identify' && !l.state.idsState.currentIssueId) throw new MovaraError('conflict', 'Start discussing an issue first (ids.start)')
    l.state.idsState.step = input.step
    await saveState(ctx, l)
    return out(l, { step: input.step })
  },
})

/** Check-in: mark an attendee as having shared (or undo). Stored in the live state so everyone sees it. */
export const meetingSetShared = defineCommand({
  name: 'meeting.set_shared',
  scope: 'write:meetings',
  input: z.object({ meetingId, personId: z.uuid(), shared: z.boolean() }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const set = new Set(l.state.sharedIds)
    if (input.shared) set.add(input.personId)
    else set.delete(input.personId)
    l.state.sharedIds = [...set]
    await saveState(ctx, l)
    return out(l, { sharedIds: l.state.sharedIds })
  },
})

// ---------------------------------------------------------------- rating / settings

/** People only: agents can never rate. */
export const meetingRate = defineCommand({
  name: 'meeting.rate',
  scope: 'write:meetings',
  input: z.object({ meetingId, score: z.number().int().min(1).max(10) }),
  run: async (ctx, input) => {
    if (ctx.actor.type !== 'person') throw new MovaraError('forbidden', 'Only people can rate a meeting')
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    await saveState(ctx, l, { ratings: { ...l.meeting.ratings, [ctx.actor.id]: input.score } })
    return out(l, { score: input.score })
  },
})

export const meetingSetSettings = defineCommand({
  name: 'meeting.set_settings',
  scope: 'write:meetings',
  input: z.object({ meetingId, sendRecap: z.boolean().optional(), clearItems: z.boolean().optional(), focusIssueCount: z.number().int().min(1).max(10).optional() }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const { meetingId: _m, ...patch } = input
    l.state.settings = { ...l.state.settings, ...patch }
    await saveState(ctx, l)
    return out(l, { settings: l.state.settings })
  },
})

// ---------------------------------------------------------------- capture

/** A notes agent (or person) adds to-dos, issues and headlines tied to the live meeting. */
export const meetingCapture = defineCommand({
  name: 'meeting.capture',
  scope: 'write:meetings',
  input: z.object({
    meetingId,
    todos: z.array(z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(10_000).optional(), ownerIds: z.array(z.uuid()).max(50).optional(), dueDate: dateSchema.optional() })).max(50).optional(),
    issues: z.array(z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(10_000).optional(), ownerIds: z.array(z.uuid()).max(50).optional(), horizon: z.enum(['short', 'long']).optional() })).max(50).optional(),
    headlines: z.array(z.object({ text: z.string().trim().min(1).max(1000), kind: z.enum(['customer', 'employee', 'general']).optional(), ownerIds: z.array(z.uuid()).max(50).optional() })).max(50).optional(),
    source: sourceSchema.optional(),
  }),
  run: async (ctx, input) => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const teamId = l.series.teamId
    const src = { type: 'meeting', id: l.meeting.id }
    const created = { todos: [] as (typeof todos.$inferSelect)[], issues: [] as (typeof issues.$inferSelect)[], headlines: [] as (typeof headlines.$inferSelect)[] }
    for (const t of input.todos ?? []) created.todos.push(...(await insertTodos(ctx, { ...t, teamId, source: input.source ?? src })))
    for (const i of input.issues ?? []) created.issues.push(...(await insertIssues(ctx, { ...i, teamId, source: input.source ?? src })))
    for (const h of input.headlines ?? []) created.headlines.push(...(await insertHeadlines(ctx, { ...h, teamId })))
    l.state.newTodoIds.push(...created.todos.map((r) => r.id))
    l.state.idsState.addedIssueIds.push(...created.issues.map((r) => r.id))
    l.state.newHeadlineIds.push(...created.headlines.map((r) => r.id))
    await saveState(ctx, l)
    return { data: created, entity: { type: 'meeting', id: l.meeting.id }, before: null, after: { todoIds: created.todos.map((r) => r.id), issueIds: created.issues.map((r) => r.id), headlineIds: created.headlines.map((r) => r.id) } }
  },
})

// ---------------------------------------------------------------- end

export type MeetingRecap = { to: string[]; subject: string; text: string; html?: string }
export type EndMeetingData = {
  meeting: typeof meetings.$inferSelect
  stats: MeetingStats
  summary: string
  recap: MeetingRecap | null
  recapSent: boolean
  cleared: { todos: number; headlines: number }
  /** The next occurrence scheduled for a recurring series (null for ad-hoc series). */
  nextMeeting: { id: string; scheduledAt: string } | null
}

const fmtDay = (d: Date, timezone = 'UTC') => todayIn({ timezone }, d)

/**
 * Finalize a live meeting: pending to-dos become done; (if settings.clearItems) done to-dos and reviewed headlines
 * are archived (soft-deleted) from the team lists; stats + summary are stored. Use `endMeeting` to also send the recap.
 */
export const meetingEnd = defineCommand({
  name: 'meeting.end',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input): Promise<{ data: EndMeetingData; entity: { type: string; id: string }; before: Record<string, unknown>; after: Record<string, unknown> }> => {
    const l = await loadMeeting(ctx, input.meetingId, true)
    requireLive(l.meeting)
    const now = new Date()
    const s = l.state
    const teamId = l.series.teamId
    stopTimer(s, s.sectionIndex, now)

    const [{ tz: orgTz } = { tz: 'UTC' }] = await ctx.db.select({ tz: orgs.timezone }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)

    // 1. pending -> done
    await ctx.db
      .update(todos)
      .set({ status: 'done', doneAt: now, ...touch(todos, ctx) })
      .where(scoped(todos, ctx, eq(todos.teamId, teamId), eq(todos.status, 'pending')))

    // 2. stats
    const startedAt = l.meeting.startedAt!
    const [prev] = await ctx.db
      .select({ endedAt: meetings.endedAt })
      .from(meetings)
      .where(scoped(meetings, ctx, eq(meetings.seriesId, l.series.id), isNotNull(meetings.endedAt), ne(meetings.id, l.meeting.id)))
      .orderBy(sql`${meetings.endedAt} desc`)
      .limit(1)
    const windowStart = prev?.endedAt ?? new Date(startedAt.getTime() - 7 * 86_400_000)
    const pool = await ctx.db
      .select({ status: todos.status, doneAt: todos.doneAt, createdAt: todos.createdAt })
      .from(todos)
      .where(scoped(todos, ctx, eq(todos.teamId, teamId)))
    const counted = pool.filter((t) => t.createdAt < startedAt && (t.status !== 'done' || (t.doneAt && t.doneAt >= windowStart)))
    const ratings = Object.values(l.meeting.ratings)
    const stats: MeetingStats = {
      durationMinutes: Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60_000)),
      ratingAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      ratingCount: ratings.length,
      issuesSolved: s.idsState.solvedIssueIds.length,
      issuesTotal: s.focusIssueIds.length,
      todosDone: counted.filter((t) => t.status === 'done').length,
      todosTotal: counted.length,
      attendeeCount: Object.values(s.presence).filter((p) => p.kind === 'person').length,
      invitedCount: l.series.attendeeIds.length,
      newTodoCount: s.newTodoIds.length,
    }

    // 3. summary + recap
    const newTodos = s.newTodoIds.length ? await ctx.db.select().from(todos).where(scoped(todos, ctx, inArray(todos.id, s.newTodoIds))) : []
    const solved = s.idsState.solvedIssueIds.length ? await ctx.db.select({ title: issues.title }).from(issues).where(scoped(issues, ctx, inArray(issues.id, s.idsState.solvedIssueIds))) : []
    const owners = newTodos.length ? await ctx.db.select({ id: people.id, name: people.name }).from(people).where(scoped(people, ctx, inArray(people.id, [...new Set(newTodos.map((t) => t.ownerId).filter((x): x is string => !!x))]))) : []
    const nameOf = (id: string | null) => owners.find((o) => o.id === id)?.name ?? 'Unassigned'
    const lines = [
      `${l.series.name} · ${fmtDay(startedAt, orgTz)}`,
      `Duration ${stats.durationMinutes} min · Rating ${stats.ratingAvg ?? 'n/a'} (${stats.ratingCount}) · Issues solved ${stats.issuesSolved}/${stats.issuesTotal} · To-dos done ${stats.todosDone}/${stats.todosTotal}`,
      ...(solved.length ? ['', 'Solved:', ...solved.map((i) => `- ${i.title}`)] : []),
      ...(newTodos.length ? ['', 'New to-dos:', ...newTodos.map((t) => `- ${t.title} (${nameOf(t.ownerId)}${t.dueDate ? `, due ${t.dueDate}` : ''})`)] : []),
    ]
    const summary = lines.join('\n')
    let recap: MeetingRecap | null = null
    if (s.settings.sendRecap && l.series.attendeeIds.length) {
      const to = await ctx.db.select({ email: people.email }).from(people).where(scoped(people, ctx, inArray(people.id, l.series.attendeeIds)))
      if (to.length) {
        const [org] = await ctx.db.select({ name: orgs.name, branding: orgs.branding, pack: orgs.terminologyPack, overrides: orgs.terminologyOverrides }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
        const T = createTerms(org?.pack, org?.overrides)
        const html = renderRecapHtml({
          orgName: org?.name ?? '',
          wordmark: org?.branding?.wordmark,
          accent: org?.branding?.accent,
          seriesName: l.series.name,
          date: fmtDay(startedAt, orgTz),
          stats,
          solved: solved.map((i) => i.title),
          newTodos: newTodos.map((t) => ({ title: t.title, owner: nameOf(t.ownerId), dueDate: t.dueDate })),
          labels: {
            issues: T.t('issue', 'plural'),
            todos: T.t('todo', 'plural'),
            newTodos: `New ${T.t('todo', 'plural').toLowerCase()}`,
            solved: T.status('solved'),
            rating: 'Rating',
            duration: 'Duration',
            attendance: 'Attendance',
          },
        })
        recap = { to: to.map((t) => t.email), subject: `${l.series.name} recap · ${fmtDay(startedAt, orgTz)}`, text: summary, html }
      }
    }

    // 4. clear items
    const cleared = { todos: 0, headlines: 0 }
    if (s.settings.clearItems) {
      cleared.todos = (await ctx.db.update(todos).set(softDelete(todos, ctx)).where(scoped(todos, ctx, eq(todos.teamId, teamId), eq(todos.status, 'done'))).returning({ id: todos.id })).length
      cleared.headlines = (await ctx.db.update(headlines).set(softDelete(headlines, ctx)).where(scoped(headlines, ctx, eq(headlines.teamId, teamId), isNotNull(headlines.reviewedAt))).returning({ id: headlines.id })).length
    }

    s.stats = stats
    const meeting = await saveState(ctx, l, { endedAt: now, summary })
    // Keep the cadence going: recurring series get their next occurrence (an already-upcoming one is reused).
    let nextMeeting: EndMeetingData['nextMeeting'] = null
    if (l.series.rrule) {
      try {
        const n = await createNextOccurrence(ctx, l.series)
        nextMeeting = { id: n.meeting.id, scheduledAt: n.meeting.scheduledAt.toISOString() }
      } catch (e) {
        if (!(e instanceof MovaraError)) throw e
      }
    }
    return {
      data: { meeting, stats, summary, recap, recapSent: false, cleared, nextMeeting },
      entity: { type: 'meeting', id: meeting.id },
      before: { endedAt: null },
      after: { endedAt: now.toISOString(), stats, cleared },
    }
  },
})

/** Internal: records that the recap email went out. */
export const meetingMarkRecapSent = defineCommand({
  name: 'meeting.mark_recap_sent',
  scope: 'write:meetings',
  input: z.object({ meetingId }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.update(meetings).set({ recapSentAt: new Date(), ...touch(meetings, ctx) }).where(scoped(meetings, ctx, eq(meetings.id, input.meetingId))).returning()
    found(row, 'Meeting')
    return { data: row!, entity: { type: 'meeting', id: row!.id }, before: { recapSentAt: null }, after: { recapSentAt: row!.recapSentAt } }
  },
})

/**
 * End a meeting and send the recap email (after the transaction commits) via the injected sender
 * (default: `setEmailSender`, which is a no-op until configured). Prefer this over `execute(ctx, meetingEnd, ...)`.
 */
export async function endMeeting(
  ctx: Ctx,
  input: z.input<typeof meetingEnd.input>,
  opts: ExecuteOptions & { emailSender?: EmailSender } = {},
): Promise<ExecuteResult<EndMeetingData>> {
  const { emailSender, ...exec } = opts
  const r = await execute(ctx, meetingEnd, input, exec)
  if (!r.ok || r.replayed || !r.data.recap) return r
  try {
    await (emailSender ?? getEmailSender()).send(r.data.recap)
    await execute(ctx, meetingMarkRecapSent, { meetingId: input.meetingId })
    r.data.recapSent = true
  } catch (e) {
    console.error('[meetings] recap email failed', e)
  }
  return r
}
