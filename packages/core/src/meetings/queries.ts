import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { headlines, issues, meetings, meetingSeries, metrics, metricValues, people, priorities, scorecards, teams, todos, type AgendaItemJson } from '@movara/db'
import { addDays, currentQuarter, quarterOf, shiftQuarter, todayIn, type CalendarSettings } from '../calendar'
import { requireRead, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { found, scoped } from '../helpers'
import { orgCalendar } from '../issues/internal'
import { dayOf, elapsedOf, loadMeeting, type MeetingRow, type SeriesRow } from './state'
import type { IdsStatus, IdsStep, MeetingSettings, MeetingStats } from './types'

// ------------------------------------------------------------------ getMeeting

export type MeetingDetail = MeetingRow & {
  status: 'scheduled' | 'live' | 'ended'
  series: SeriesRow
  team: { id: string; name: string }
  attendees: { id: string; name: string; email: string }[]
  agenda: AgendaItemJson[]
}

/** A meeting with its series, team, attendees and agenda (live agenda snapshot once started). */
export async function getMeeting(ctx: Ctx, id: string): Promise<MeetingDetail> {
  requireRead(ctx)
  const l = await loadMeeting(ctx, id)
  const [team] = await ctx.db.select({ id: teams.id, name: teams.name }).from(teams).where(scoped(teams, ctx, eq(teams.id, l.series.teamId))).limit(1)
  const attendees = l.series.attendeeIds.length
    ? await ctx.db.select({ id: people.id, name: people.name, email: people.email }).from(people).where(scoped(people, ctx, inArray(people.id, l.series.attendeeIds))).orderBy(asc(people.name))
    : []
  return {
    ...l.meeting,
    status: l.meeting.endedAt ? 'ended' : l.meeting.startedAt ? 'live' : 'scheduled',
    series: l.series,
    team: team ?? { id: l.series.teamId, name: '' },
    attendees,
    agenda: l.state.agenda,
  }
}

// ------------------------------------------------------------------ live state

export type LiveSection = { index: number; term: string; minutes: number; /** 1 or 2; 1 for single-day agendas. */ day: 1 | 2; elapsedMs: number; running: boolean }
export type LiveFocusIssue = { id: string; title: string; ownerId: string | null; rank: number; status: string; discussed: boolean; solved: boolean }

/** Shape served to the live-meeting UI and agents (poll with `sinceRev`). */
export type LiveState = {
  /** Monotonically increasing; bumped on every state change (including to-do/issue/headline changes of the team while live). */
  rev: number
  /** ISO server time: clients compute timers as `elapsedMs + (now - serverTime)` for running sections. */
  serverTime: string
  meetingId: string
  seriesId: string
  teamId: string
  name: string
  status: 'scheduled' | 'live' | 'paused' | 'ended'
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  sectionIndex: number
  agenda: LiveSection[]
  paused: boolean
  /** Multi-day sessions: the current day, the number of days, and whether the session is between days (paused). */
  day: number
  days: number
  dayBreak: boolean
  endedDays: number[]
  facilitatorId: string | null
  presence: { kind: 'person' | 'agent'; id: string; name: string; onBehalfOf?: string; joinedAt: string; lastSeen: string; online: boolean }[]
  attendees: { id: string; name: string; present: boolean; rated: boolean }[]
  settings: MeetingSettings
  ids: {
    status: IdsStatus
    step: IdsStep
    currentIssueId: string | null
    focusIssueIds: string[]
    focusIssues: LiveFocusIssue[]
    discussedIssueIds: string[]
    solvedIssueIds: string[]
    addedIssueIds: string[]
  }
  /** Ratings are anonymous while live (`all` only after the meeting ends). */
  ratings: { count: number; mine: number | null; average: number | null; all: Record<string, number> | null }
  counts: { openTodos: number; pendingTodos: number; doneTodos: number; newTodos: number; headlinesToReview: number; headlinesReviewed: number; openIssues: number }
  reviewedHeadlineIds: string[]
  /** Check-in: ids of attendees marked as having shared. */
  sharedIds: string[]
  /** Quarter review: 1-10 grade of the quarter per attendee id. */
  quarterGrades: Record<string, number>
  /** Team health: 1-10 rating and note per attendee id. */
  teamHealth: Record<string, { rating: number; note: string }>
  newTodoIds: string[]
  newHeadlineIds: string[]
  stats: MeetingStats | null
  summary: string | null
}

const ONLINE_MS = 60_000

/**
 * Live state for polling. With `sinceRev`, returns `null` when nothing changed (cheap: one indexed read).
 * Presence heartbeats do not bump `rev`; `lastSeen`/`online` are fresh whenever a full state is returned.
 */
export async function getLiveState(ctx: Ctx, meetingId: string, opts: { sinceRev?: number } = {}): Promise<LiveState | null> {
  requireRead(ctx)
  const l = await loadMeeting(ctx, meetingId)
  const s = l.state
  if (opts.sinceRev !== undefined && opts.sinceRev === s.rev) return null
  const now = new Date()
  const nowMs = now.getTime()
  const teamId = l.series.teamId

  const agenda: LiveSection[] = s.agenda.map((a, i) => ({ index: i, term: a.term, minutes: a.minutes, day: a.day ?? 1, elapsedMs: elapsedOf(s.timers[String(i)], nowMs), running: !!s.timers[String(i)]?.runningSince }))
  const presence = Object.values(s.presence).map((p) => ({ ...p, online: nowMs - new Date(p.lastSeen).getTime() < ONLINE_MS }))
  const attendeeRows = l.series.attendeeIds.length ? await ctx.db.select({ id: people.id, name: people.name }).from(people).where(scoped(people, ctx, inArray(people.id, l.series.attendeeIds))).orderBy(asc(people.name)) : []

  const focusRows = s.focusIssueIds.length ? await ctx.db.select().from(issues).where(scoped(issues, ctx, inArray(issues.id, s.focusIssueIds))) : []
  const focusIssues: LiveFocusIssue[] = s.focusIssueIds.flatMap((id) => {
    const r = focusRows.find((x) => x.id === id)
    return r ? [{ id, title: r.title, ownerId: r.ownerId, rank: r.rank, status: r.status, discussed: s.idsState.discussedIssueIds.includes(id), solved: s.idsState.solvedIssueIds.includes(id) }] : []
  })

  const todoCounts = await ctx.db.select({ status: todos.status, n: sql<number>`count(*)::int` }).from(todos).where(scoped(todos, ctx, eq(todos.teamId, teamId))).groupBy(todos.status)
  const nTodo = (st: string) => todoCounts.find((c) => c.status === st)?.n ?? 0
  const [hl] = await ctx.db
    .select({ toReview: sql<number>`count(*) filter (where ${headlines.reviewedAt} is null)::int`, reviewed: sql<number>`count(*) filter (where ${headlines.reviewedAt} is not null)::int` })
    .from(headlines)
    .where(scoped(headlines, ctx, eq(headlines.teamId, teamId)))
  const [oi] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(issues).where(scoped(issues, ctx, eq(issues.teamId, teamId), eq(issues.status, 'open')))

  const ratingVals = Object.values(l.meeting.ratings)
  const ended = !!l.meeting.endedAt
  const me = ctx.actor.type === 'person' ? ctx.actor.id : null
  return {
    rev: s.rev,
    serverTime: now.toISOString(),
    meetingId: l.meeting.id,
    seriesId: l.series.id,
    teamId,
    name: l.series.name,
    status: ended ? 'ended' : l.meeting.startedAt ? (s.paused ? 'paused' : 'live') : 'scheduled',
    scheduledAt: l.meeting.scheduledAt.toISOString(),
    startedAt: l.meeting.startedAt?.toISOString() ?? null,
    endedAt: l.meeting.endedAt?.toISOString() ?? null,
    sectionIndex: s.sectionIndex,
    agenda,
    paused: s.paused,
    day: dayOf(s.agenda, s.sectionIndex),
    days: Math.max(1, ...s.agenda.map((a) => a.day ?? 1)),
    dayBreak: s.dayBreak,
    endedDays: s.endedDays,
    facilitatorId: l.series.facilitatorId,
    presence,
    attendees: attendeeRows.map((p) => ({ id: p.id, name: p.name, present: !!s.presence[p.id], rated: l.meeting.ratings[p.id] !== undefined })),
    settings: s.settings,
    ids: {
      status: s.idsState.status,
      step: s.idsState.step,
      currentIssueId: s.idsState.currentIssueId,
      focusIssueIds: s.focusIssueIds,
      focusIssues,
      discussedIssueIds: s.idsState.discussedIssueIds,
      solvedIssueIds: s.idsState.solvedIssueIds,
      addedIssueIds: s.idsState.addedIssueIds,
    },
    ratings: {
      count: ratingVals.length,
      mine: me ? (l.meeting.ratings[me] ?? null) : null,
      average: ratingVals.length ? Math.round((ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length) * 10) / 10 : null,
      all: ended ? l.meeting.ratings : null,
    },
    counts: { openTodos: nTodo('open'), pendingTodos: nTodo('pending'), doneTodos: nTodo('done'), newTodos: s.newTodoIds.length, headlinesToReview: hl?.toReview ?? 0, headlinesReviewed: hl?.reviewed ?? 0, openIssues: oi?.n ?? 0 },
    reviewedHeadlineIds: s.reviewedHeadlineIds,
    sharedIds: s.sharedIds,
    quarterGrades: s.quarterGrades,
    teamHealth: s.teamHealth,
    newTodoIds: s.newTodoIds,
    newHeadlineIds: s.newHeadlineIds,
    stats: s.stats ?? null,
    summary: l.meeting.summary,
  }
}

// ------------------------------------------------------------------ planning quarters

/**
 * Which quarter a planning session reviews and which it plans. In the first month of a quarter the session
 * closes the quarter that just ended (review = previous, plan = current); later it looks ahead
 * (review = current, plan = next).
 */
export function planningQuarters(cal: CalendarSettings, today: string): { review: string; plan: string } {
  const q = quarterOf(today, cal)
  const elapsedDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${q.start}T00:00:00Z`)) / 86_400_000)
  return elapsedDays <= 30
    ? { review: shiftQuarter(q.label, -1, cal), plan: q.label }
    : { review: q.label, plan: shiftQuarter(q.label, 1, cal) }
}

// ------------------------------------------------------------------ history

export type MeetingHistoryItem = MeetingStats & {
  meetingId: string
  seriesId: string
  seriesName: string
  teamId: string
  scheduledAt: Date
  startedAt: Date | null
  endedAt: Date
  hasSummary: boolean
  summary: string | null
}

/** Ended meetings (newest first) with their stats. Falls back to ratings/timestamps for meetings without stored stats. */
export async function listMeetingHistory(ctx: Ctx, input: { seriesId?: string; teamId?: string; limit?: number } = {}): Promise<MeetingHistoryItem[]> {
  requireRead(ctx)
  const rows = await ctx.db
    .select({ m: meetings, series: meetingSeries })
    .from(meetings)
    .innerJoin(meetingSeries, and(eq(meetingSeries.id, meetings.seriesId), isNull(meetingSeries.deletedAt)))
    .where(scoped(meetings, ctx, isNotNull(meetings.endedAt), input.seriesId ? eq(meetings.seriesId, input.seriesId) : undefined, input.teamId ? eq(meetingSeries.teamId, input.teamId) : undefined))
    .orderBy(desc(meetings.endedAt))
    .limit(Math.min(input.limit ?? 20, 200))
  return rows.map(({ m, series }) => {
    const st = (m.state as { stats?: MeetingStats }).stats
    const rv = Object.values(m.ratings)
    const fallback: MeetingStats = {
      durationMinutes: m.startedAt && m.endedAt ? Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 60_000) : 0,
      ratingAvg: rv.length ? Math.round((rv.reduce((a, b) => a + b, 0) / rv.length) * 10) / 10 : null,
      ratingCount: rv.length,
      issuesSolved: 0,
      issuesTotal: 0,
      todosDone: 0,
      todosTotal: 0,
      attendeeCount: rv.length,
      invitedCount: series.attendeeIds.length,
      newTodoCount: 0,
    }
    return { ...(st ?? fallback), meetingId: m.id, seriesId: series.id, seriesName: series.name, teamId: series.teamId, scheduledAt: m.scheduledAt, startedAt: m.startedAt, endedAt: m.endedAt!, hasSummary: !!m.summary, summary: m.summary }
  })
}

// ------------------------------------------------------------------ prepare

type Comparison = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'between'
function metricOnTrack(value: number, comparison: Comparison, goal: number | null, goalUpper: number | null): boolean {
  if (goal === null) return true
  switch (comparison) {
    case 'gte': return value >= goal
    case 'lte': return value <= goal
    case 'gt': return value > goal
    case 'lt': return value < goal
    case 'eq': return value === goal
    case 'between': return value >= goal && value <= (goalUpper ?? goal)
  }
}

export type MeetingPrep = {
  teamId: string
  teamName: string
  generatedAt: string
  offTrackMetrics: { id: string; title: string; ownerIds: string[]; comparison: Comparison; goal: number | null; goalUpper: number | null; value: number; periodStart: string }[]
  offTrackPriorities: { id: string; title: string; ownerId: string | null; level: string; dueDate: string | null }[]
  openIssues: { id: string; title: string; ownerId: string | null; rank: number; horizon: string }[]
  overdueTodos: { id: string; title: string; ownerId: string | null; dueDate: string | null }[]
  headlinesToReview: { id: string; text: string; kind: string; ownerId: string | null }[]
}

/** Pre-read for a meeting: off-track metrics/priorities, ranked open issues, overdue to-dos, headlines to review. */
export async function prepareMeeting(ctx: Ctx, input: { meetingId?: string; seriesId?: string; teamId?: string }): Promise<MeetingPrep> {
  requireRead(ctx)
  let teamId = input.teamId
  if (input.meetingId) teamId = (await loadMeeting(ctx, input.meetingId)).series.teamId
  else if (input.seriesId) {
    const [s] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, input.seriesId))).limit(1)
    teamId = found(s, 'Meeting series').teamId
  }
  if (!teamId) throw new MovaraError('validation', 'Provide meetingId, seriesId or teamId')
  const [team] = await ctx.db.select().from(teams).where(scoped(teams, ctx, eq(teams.id, teamId))).limit(1)
  found(team, 'Team')
  const cal = await orgCalendar(ctx)
  const today = todayIn(cal)

  // Metrics: latest recorded value of each metric on the team's scorecard(s), evaluated against its goal (read-only).
  const ms = await ctx.db
    .select({ m: metrics })
    .from(metrics)
    .innerJoin(scorecards, and(eq(scorecards.id, metrics.scorecardId), isNull(scorecards.deletedAt)))
    .where(scoped(metrics, ctx, eq(scorecards.teamId, teamId)))
    .orderBy(asc(metrics.sort))
  const offTrackMetrics: MeetingPrep['offTrackMetrics'] = []
  if (ms.length) {
    const vals = await ctx.db
      .select()
      .from(metricValues)
      .where(scoped(metricValues, ctx, inArray(metricValues.metricId, ms.map((x) => x.m.id)), isNotNull(metricValues.value), gte(metricValues.periodStart, addDays(today, -120))))
      .orderBy(desc(metricValues.periodStart))
    for (const { m } of ms) {
      const v = vals.find((x) => x.metricId === m.id)
      if (v && v.value !== null && !metricOnTrack(v.value, m.comparison, m.goal, m.goalUpper)) {
        offTrackMetrics.push({ id: m.id, title: m.title, ownerIds: m.ownerIds, comparison: m.comparison, goal: m.goal, goalUpper: m.goalUpper, value: v.value, periodStart: v.periodStart })
      }
    }
  }

  const quarter = currentQuarter(cal)
  const offTrackPriorities = await ctx.db
    .select({ id: priorities.id, title: priorities.title, ownerId: priorities.ownerId, level: priorities.level, dueDate: priorities.dueDate })
    .from(priorities)
    .where(scoped(priorities, ctx, eq(priorities.quarter, quarter), eq(priorities.status, 'off_track'), team!.isLeadership ? or(eq(priorities.teamId, teamId), eq(priorities.level, 'company')) : eq(priorities.teamId, teamId)))
    .orderBy(asc(priorities.sort))

  const openIssues = await ctx.db
    .select({ id: issues.id, title: issues.title, ownerId: issues.ownerId, rank: issues.rank, horizon: issues.horizon })
    .from(issues)
    .where(scoped(issues, ctx, eq(issues.teamId, teamId), eq(issues.status, 'open'), eq(issues.horizon, 'short')))
    .orderBy(asc(issues.rank))
  const overdueTodos = await ctx.db
    .select({ id: todos.id, title: todos.title, ownerId: todos.ownerId, dueDate: todos.dueDate })
    .from(todos)
    .where(scoped(todos, ctx, eq(todos.teamId, teamId), eq(todos.status, 'open'), lt(todos.dueDate, today)))
    .orderBy(asc(todos.dueDate))
  const headlinesToReview = await ctx.db
    .select({ id: headlines.id, text: headlines.text, kind: headlines.kind, ownerId: headlines.ownerId })
    .from(headlines)
    .where(scoped(headlines, ctx, eq(headlines.teamId, teamId), isNull(headlines.reviewedAt)))
    .orderBy(asc(headlines.createdAt))

  return { teamId, teamName: team!.name, generatedAt: new Date().toISOString(), offTrackMetrics, offTrackPriorities, openIssues, overdueTodos, headlinesToReview }
}

