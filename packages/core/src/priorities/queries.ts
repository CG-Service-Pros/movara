import { asc, eq, inArray } from 'drizzle-orm'
import { milestones, priorities } from '@motion/db'
import { weekOfQuarter, todayIn, currentQuarter, isQuarterLabel } from '../calendar'
import { requireRead, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { found, scoped } from '../helpers'
import { getOrg } from '../org'

export type PriorityRow = typeof priorities.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type PriorityStatus = PriorityRow['status']
export type PriorityLevel = PriorityRow['level']
export const PRIORITY_STATUSES = ['on_track', 'off_track', 'done', 'not_done', 'dropped'] as const

export type PriorityListItem = PriorityRow & { milestonesTotal: number; milestonesDone: number }
export type PriorityDetail = PriorityRow & { milestones: MilestoneRow[]; parent: PriorityRow | null; children: PriorityRow[] }

export type ListPrioritiesInput = {
  /** Defaults to the org's current quarter. */
  quarter?: string
  teamId?: string
  ownerId?: string
  status?: PriorityStatus | PriorityStatus[]
  level?: PriorityLevel
}

/** Priorities of a quarter (default: current), ordered by `sort`, with milestone progress counts. */
export async function listPriorities(ctx: Ctx, input: ListPrioritiesInput = {}): Promise<PriorityListItem[]> {
  requireRead(ctx)
  const org = await getOrg(ctx)
  const quarter = input.quarter ?? currentQuarter(org)
  if (!isQuarterLabel(quarter)) throw new MotionError('validation', 'quarter must look like 2026-Q4')
  const statuses = input.status === undefined ? undefined : Array.isArray(input.status) ? input.status : [input.status]
  const rows = await ctx.db
    .select()
    .from(priorities)
    .where(
      scoped(
        priorities,
        ctx,
        eq(priorities.quarter, quarter),
        input.teamId ? eq(priorities.teamId, input.teamId) : undefined,
        input.ownerId ? eq(priorities.ownerId, input.ownerId) : undefined,
        statuses?.length ? inArray(priorities.status, statuses) : undefined,
        input.level ? eq(priorities.level, input.level) : undefined,
      ),
    )
    .orderBy(asc(priorities.sort), asc(priorities.createdAt))
  if (!rows.length) return []
  const ms = await ctx.db
    .select({ priorityId: milestones.priorityId, doneAt: milestones.doneAt })
    .from(milestones)
    .where(scoped(milestones, ctx, inArray(milestones.priorityId, rows.map((r) => r.id))))
  return rows.map((r) => {
    const mine = ms.filter((m) => m.priorityId === r.id)
    return { ...r, milestonesTotal: mine.length, milestonesDone: mine.filter((m) => m.doneAt).length }
  })
}

/** One priority with its milestones (ordered), parent and cascaded children. */
export async function getPriority(ctx: Ctx, id: string): Promise<PriorityDetail> {
  requireRead(ctx)
  const [p] = await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.id, id))).limit(1)
  const row = found(p, 'Priority')
  const ms = await ctx.db.select().from(milestones).where(scoped(milestones, ctx, eq(milestones.priorityId, id))).orderBy(asc(milestones.sort), asc(milestones.createdAt))
  const parent = row.parentPriorityId
    ? ((await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.id, row.parentPriorityId))).limit(1))[0] ?? null)
    : null
  const children = await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.parentPriorityId, id))).orderBy(asc(priorities.sort))
  return { ...row, milestones: ms, parent, children }
}

export type PrioritiesSummary = {
  quarter: string
  /** Week N of 13 for today when `quarter` is the current quarter, otherwise null. */
  week: { week: number; of: 13 } | null
  total: number
  byStatus: Record<PriorityStatus, number>
  milestonesTotal: number
  milestonesDone: number
}

/** Counts by status for a quarter (default: current) plus "week N of 13". */
export async function prioritiesSummary(ctx: Ctx, input: { quarter?: string; teamId?: string; asOf?: string } = {}): Promise<PrioritiesSummary> {
  requireRead(ctx)
  const org = await getOrg(ctx)
  const today = input.asOf ?? todayIn(org)
  const quarter = input.quarter ?? currentQuarter(org, new Date(`${today}T12:00:00Z`))
  const items = await listPriorities(ctx, { quarter, teamId: input.teamId })
  const byStatus: Record<PriorityStatus, number> = { on_track: 0, off_track: 0, done: 0, not_done: 0, dropped: 0 }
  for (const p of items) byStatus[p.status]++
  const w = weekOfQuarter(today, org)
  return {
    quarter,
    week: w.quarter === quarter ? { week: w.week, of: w.of } : null,
    total: items.length,
    byStatus,
    milestonesTotal: items.reduce((a, p) => a + p.milestonesTotal, 0),
    milestonesDone: items.reduce((a, p) => a + p.milestonesDone, 0),
  }
}
