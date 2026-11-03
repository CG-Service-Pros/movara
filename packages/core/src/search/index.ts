import { and, asc, desc, eq, gte, ilike, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { headlines, issues, meetings, meetingSeries, metricValues, metrics, milestones, people, priorities, scorecards, todos } from '@movara/db'
import { currentQuarter, periodStart, todayIn, weekOfQuarter } from '../calendar'
import { actingPersonId, requireRead, type Ctx } from '../ctx'
import { scoped } from '../helpers'
import { orgCalendar } from '../issues/internal'

export const SEARCH_TYPES = ['priority', 'metric', 'issue', 'todo', 'headline', 'person', 'meeting'] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

export type SearchHit = {
  type: SearchType
  id: string
  title: string
  subtitle?: string
  status?: string
  teamId?: string | null
  ownerId?: string | null
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * Search priorities, metrics, issues, to-dos, headlines, people and meetings (ILIKE on titles/text/names).
 * `limit` caps each type and the total (default 20, max 100). Title prefix matches rank first.
 */
export async function search(ctx: Ctx, q: string, opts: { types?: SearchType[]; limit?: number } = {}): Promise<SearchHit[]> {
  requireRead(ctx)
  const term = q.trim()
  if (!term) return []
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const types = new Set<SearchType>(opts.types?.length ? opts.types : SEARCH_TYPES)
  const pat = like(term)
  const jobs: Promise<SearchHit[]>[] = []

  if (types.has('priority'))
    jobs.push(
      ctx.db.select().from(priorities).where(scoped(priorities, ctx, or(ilike(priorities.title, pat), ilike(priorities.description, pat)))).orderBy(desc(priorities.quarter)).limit(limit)
        .then((rs) => rs.map((r) => ({ type: 'priority' as const, id: r.id, title: r.title, subtitle: r.quarter, status: r.status, teamId: r.teamId, ownerId: r.ownerId }))),
    )
  if (types.has('metric'))
    jobs.push(
      ctx.db.select({ m: metrics, teamId: scorecards.teamId }).from(metrics).innerJoin(scorecards, eq(scorecards.id, metrics.scorecardId)).where(scoped(metrics, ctx, ilike(metrics.title, pat))).orderBy(asc(metrics.sort)).limit(limit)
        .then((rs) => rs.map(({ m, teamId }) => ({ type: 'metric' as const, id: m.id, title: m.title, teamId, ownerId: m.ownerIds[0] ?? null }))),
    )
  if (types.has('issue'))
    jobs.push(
      ctx.db.select().from(issues).where(scoped(issues, ctx, or(ilike(issues.title, pat), ilike(issues.description, pat)))).orderBy(asc(issues.rank)).limit(limit)
        .then((rs) => rs.map((r) => ({ type: 'issue' as const, id: r.id, title: r.title, subtitle: r.horizon === 'long' ? 'Long-term' : undefined, status: r.status, teamId: r.teamId, ownerId: r.ownerId }))),
    )
  if (types.has('todo'))
    jobs.push(
      ctx.db.select().from(todos).where(scoped(todos, ctx, or(ilike(todos.title, pat), ilike(todos.description, pat)))).orderBy(desc(todos.createdAt)).limit(limit)
        .then((rs) => rs.map((r) => ({ type: 'todo' as const, id: r.id, title: r.title, subtitle: r.dueDate ? `Due ${r.dueDate}` : undefined, status: r.status, teamId: r.teamId, ownerId: r.ownerId }))),
    )
  if (types.has('headline'))
    jobs.push(
      ctx.db.select().from(headlines).where(scoped(headlines, ctx, ilike(headlines.text, pat))).orderBy(desc(headlines.createdAt)).limit(limit)
        .then((rs) => rs.map((r) => ({ type: 'headline' as const, id: r.id, title: r.text, subtitle: r.kind, status: r.reviewedAt ? 'reviewed' : 'to_review', teamId: r.teamId, ownerId: r.ownerId }))),
    )
  if (types.has('person'))
    jobs.push(
      ctx.db.select().from(people).where(scoped(people, ctx, or(ilike(people.name, pat), ilike(people.email, pat)))).orderBy(asc(people.name)).limit(limit)
        .then((rs) => rs.map((r) => ({ type: 'person' as const, id: r.id, title: r.name, subtitle: r.email, status: r.role }))),
    )
  if (types.has('meeting'))
    jobs.push(
      ctx.db.select({ m: meetings, s: meetingSeries }).from(meetings).innerJoin(meetingSeries, eq(meetingSeries.id, meetings.seriesId)).where(scoped(meetings, ctx, ilike(meetingSeries.name, pat), isNull(meetingSeries.deletedAt))).orderBy(desc(meetings.scheduledAt)).limit(limit)
        .then((rs) => rs.map(({ m, s }) => ({ type: 'meeting' as const, id: m.id, title: s.name, subtitle: m.scheduledAt.toISOString().slice(0, 10), status: m.endedAt ? 'ended' : m.startedAt ? 'live' : 'scheduled', teamId: s.teamId }))),
    )

  const lower = term.toLowerCase()
  const rank = (h: SearchHit) => (h.title.toLowerCase().startsWith(lower) ? 0 : 1)
  return (await Promise.all(jobs)).flat().sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

// ------------------------------------------------------------------ my week

export type MyWeek = {
  personId: string
  today: string
  quarter: string
  week: { week: number; of: number }
  priorities: { id: string; title: string; status: string; dueDate: string | null; teamId: string | null; milestonesDone: number; milestonesTotal: number }[]
  /** Metrics I own that have no value yet for the current period. */
  metricsDue: { id: string; title: string; teamId: string; interval: string; periodStart: string }[]
  todos: { id: string; title: string; status: string; dueDate: string | null; teamId: string | null; overdue: boolean }[]
  nextMeeting: { id: string; seriesId: string; name: string; teamId: string; scheduledAt: Date; live: boolean } | null
}

/** The acting person's week: current-quarter priorities, metrics awaiting a value, open to-dos, next meeting. */
export async function myWeek(ctx: Ctx): Promise<MyWeek> {
  requireRead(ctx)
  const me = actingPersonId(ctx)
  const cal = await orgCalendar(ctx)
  const today = todayIn(cal)
  const quarter = currentQuarter(cal)

  const ps = await ctx.db
    .select()
    .from(priorities)
    .where(scoped(priorities, ctx, eq(priorities.ownerId, me), eq(priorities.quarter, quarter), notInArray(priorities.status, ['dropped'])))
    .orderBy(asc(priorities.sort))
  const ms = ps.length ? await ctx.db.select({ priorityId: milestones.priorityId, doneAt: milestones.doneAt }).from(milestones).where(scoped(milestones, ctx, inArray(milestones.priorityId, ps.map((p) => p.id)))) : []

  const myMetrics = await ctx.db
    .select({ m: metrics, interval: scorecards.interval, teamId: scorecards.teamId, weekStartDay: scorecards.weekStartDay })
    .from(metrics)
    .innerJoin(scorecards, and(eq(scorecards.id, metrics.scorecardId), isNull(scorecards.deletedAt)))
    .where(scoped(metrics, ctx, sql`${me}::uuid = ANY(${metrics.ownerIds})`))
    .orderBy(asc(metrics.sort))
  const due = myMetrics.map((x) => ({ ...x, period: periodStart(today, x.interval, { ...cal, weekStartDay: x.weekStartDay }) }))
  const have = due.length
    ? await ctx.db
        .select({ metricId: metricValues.metricId, periodStart: metricValues.periodStart })
        .from(metricValues)
        .where(scoped(metricValues, ctx, inArray(metricValues.metricId, due.map((d) => d.m.id)), sql`${metricValues.value} is not null`, gte(metricValues.periodStart, due.map((d) => d.period).sort()[0]!)))
    : []

  const myTodos = await ctx.db
    .select()
    .from(todos)
    .where(scoped(todos, ctx, eq(todos.ownerId, me), inArray(todos.status, ['open', 'pending'])))
    .orderBy(sql`${todos.dueDate} asc nulls last`, asc(todos.createdAt))

  const [next] = await ctx.db
    .select({ m: meetings, s: meetingSeries })
    .from(meetings)
    .innerJoin(meetingSeries, and(eq(meetingSeries.id, meetings.seriesId), isNull(meetingSeries.deletedAt)))
    .where(scoped(meetings, ctx, isNull(meetings.endedAt), gte(meetings.scheduledAt, new Date(Date.now() - 12 * 3600_000)), sql`${me}::uuid = ANY(${meetingSeries.attendeeIds})` as SQL))
    .orderBy(asc(meetings.scheduledAt))
    .limit(1)

  return {
    personId: me,
    today,
    quarter,
    week: (({ week, of }) => ({ week, of }))(weekOfQuarter(today, cal)),
    priorities: ps.map((p) => ({ id: p.id, title: p.title, status: p.status, dueDate: p.dueDate, teamId: p.teamId, milestonesDone: ms.filter((m) => m.priorityId === p.id && m.doneAt).length, milestonesTotal: ms.filter((m) => m.priorityId === p.id).length })),
    metricsDue: due.filter((d) => !have.some((h) => h.metricId === d.m.id && h.periodStart === d.period)).map((d) => ({ id: d.m.id, title: d.m.title, teamId: d.teamId, interval: d.interval, periodStart: d.period })),
    todos: myTodos.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, teamId: t.teamId, overdue: !!t.dueDate && t.dueDate < today && t.status === 'open' })),
    nextMeeting: next ? { id: next.m.id, seriesId: next.s.id, name: next.s.name, teamId: next.s.teamId, scheduledAt: next.m.scheduledAt, live: !!next.m.startedAt } : null,
  }
}
