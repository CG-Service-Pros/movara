import { and, asc, eq, inArray } from 'drizzle-orm'
import { metricValues, metrics, scorecards, teams } from '@motion/db'
import { recentPeriods, todayIn, type CalendarSettings } from '../calendar'
import { requireRead, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { found, scoped } from '../helpers'
import { getOrg } from '../org'
import { metricStatus, type MetricStatus } from './status'

export type ScorecardRow = typeof scorecards.$inferSelect
export type MetricRow = typeof metrics.$inferSelect

export type ScorecardCell = { periodStart: string; value: number | null; note: string | null; status: MetricStatus }
export type ScorecardMetric = MetricRow & {
  cells: ScorecardCell[]
  /** Sum of the shown values, only for additive metrics (otherwise null). */
  total: number | null
  /** Mean of the shown values that exist (null when none). */
  average: number | null
  /** Status of the latest period. */
  latestStatus: MetricStatus
}
export type ScorecardView = {
  scorecard: ScorecardRow & { teamName: string }
  /** Period starts, oldest first; the last one is the current period. */
  periods: string[]
  metrics: ScorecardMetric[]
  latestPeriod: string
  onTrackCount: number
  offTrackCount: number
  missingCount: number
}

export const calendarFor = (org: CalendarSettings, sc: Pick<ScorecardRow, 'weekStartDay'>): CalendarSettings => ({ ...org, weekStartDay: sc.weekStartDay })

export async function listScorecards(ctx: Ctx): Promise<(ScorecardRow & { teamName: string; metricCount: number })[]> {
  requireRead(ctx)
  const rows = await ctx.db
    .select({ sc: scorecards, teamName: teams.name })
    .from(scorecards)
    .innerJoin(teams, and(eq(teams.id, scorecards.teamId), eq(teams.orgId, ctx.orgId)))
    .where(scoped(scorecards, ctx))
    .orderBy(asc(teams.name))
  const ms = rows.length ? await ctx.db.select({ scorecardId: metrics.scorecardId }).from(metrics).where(scoped(metrics, ctx)) : []
  return rows.map((r) => ({ ...r.sc, teamName: r.teamName, metricCount: ms.filter((m) => m.scorecardId === r.sc.id).length }))
}

export async function getMetric(ctx: Ctx, id: string): Promise<MetricRow> {
  requireRead(ctx)
  const [m] = await ctx.db.select().from(metrics).where(scoped(metrics, ctx, eq(metrics.id, id))).limit(1)
  return found(m, 'Metric')
}

async function buildView(ctx: Ctx, org: CalendarSettings, sc: ScorecardRow & { teamName: string }, periodsCount: number | undefined, asOf: string): Promise<ScorecardView> {
  const cal = calendarFor(org, sc)
  const count = periodsCount ?? sc.periodsShown
  const periods = recentPeriods(asOf, sc.interval, count, cal)
  const ms = await ctx.db.select().from(metrics).where(scoped(metrics, ctx, eq(metrics.scorecardId, sc.id))).orderBy(asc(metrics.sort), asc(metrics.createdAt))
  const vals = ms.length
    ? await ctx.db.select().from(metricValues).where(scoped(metricValues, ctx, inArray(metricValues.metricId, ms.map((m) => m.id))))
    : []
  const wanted = new Set(periods)
  const byKey = new Map(vals.filter((v) => wanted.has(v.periodStart)).map((v) => [`${v.metricId}|${v.periodStart}`, v]))
  const out: ScorecardMetric[] = ms.map((m) => {
    const cells = periods.map((p): ScorecardCell => {
      const v = byKey.get(`${m.id}|${p}`)
      const value = v?.value ?? null
      return { periodStart: p, value, note: v?.note ?? null, status: metricStatus(m, value) }
    })
    const present = cells.filter((c) => c.value !== null).map((c) => c.value as number)
    const sum = present.reduce((a, b) => a + b, 0)
    return {
      ...m,
      cells,
      total: m.additive && present.length ? sum : null,
      average: present.length ? sum / present.length : null,
      latestStatus: cells[cells.length - 1]!.status,
    }
  })
  return {
    scorecard: sc,
    periods,
    metrics: out,
    latestPeriod: periods[periods.length - 1]!,
    onTrackCount: out.filter((m) => m.latestStatus === 'on').length,
    offTrackCount: out.filter((m) => m.latestStatus === 'off').length,
    missingCount: out.filter((m) => m.latestStatus === 'missing').length,
  }
}

export type GetScorecardInput = {
  scorecardId?: string
  teamId?: string
  /** How many periods to show (default: the scorecard's periodsShown). */
  periods?: number
  /** Treat this 'YYYY-MM-DD' date as today (tests, back-dated views). */
  asOf?: string
}

/** Metrics × periods with computed status, totals/averages and the on-track count of the latest period. */
export async function getScorecard(ctx: Ctx, input: GetScorecardInput): Promise<ScorecardView> {
  requireRead(ctx)
  if (!input.scorecardId && !input.teamId) throw new MotionError('validation', 'scorecardId or teamId is required')
  if (input.periods !== undefined && (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > 104)) {
    throw new MotionError('validation', 'periods must be an integer between 1 and 104')
  }
  const org = await getOrg(ctx)
  const [row] = await ctx.db
    .select({ sc: scorecards, teamName: teams.name })
    .from(scorecards)
    .innerJoin(teams, and(eq(teams.id, scorecards.teamId), eq(teams.orgId, ctx.orgId)))
    .where(scoped(scorecards, ctx, input.scorecardId ? eq(scorecards.id, input.scorecardId) : eq(scorecards.teamId, input.teamId!)))
    .limit(1)
  const r = found(row, 'Scorecard')
  return buildView(ctx, org, { ...r.sc, teamName: r.teamName }, input.periods, input.asOf ?? todayIn(org))
}

export type OffTrackMetric = { scorecardId: string; teamId: string; teamName: string; metric: MetricRow; period: string; value: number; status: 'off' }

/** Org-wide: metrics that are off track in the latest (current) period of their scorecard. */
export async function offTrackMetrics(ctx: Ctx, input: { asOf?: string } = {}): Promise<OffTrackMetric[]> {
  requireRead(ctx)
  const org = await getOrg(ctx)
  const asOf = input.asOf ?? todayIn(org)
  const res: OffTrackMetric[] = []
  for (const sc of await listScorecards(ctx)) {
    const view = await buildView(ctx, org, sc, 1, asOf)
    for (const m of view.metrics) {
      if (m.latestStatus === 'off') res.push({ scorecardId: sc.id, teamId: sc.teamId, teamName: sc.teamName, metric: m, period: view.latestPeriod, value: m.cells[0]!.value as number, status: 'off' })
    }
  }
  return res
}
