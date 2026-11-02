import { asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { issues } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type IssueRow = typeof issues.$inferSelect

type IssueStatus = 'open' | 'solved' | 'dropped'

export type ListIssuesInput = {
  teamId?: string
  horizon?: 'short' | 'long'
  /** Default: 'open'. A single status, 'all', or a list of statuses. */
  status?: IssueStatus | 'all' | IssueStatus[]
  ownerId?: string
  limit?: number
}

/** Issues ordered by rank (open) or most recently solved first. */
export async function listIssues(ctx: Ctx, input: ListIssuesInput = {}): Promise<IssueRow[]> {
  requireRead(ctx)
  const raw = input.status ?? 'open'
  const list = Array.isArray(raw) ? raw : [raw]
  const all = list.includes('all')
  const statuses = list.filter((s): s is IssueStatus => s !== 'all')
  // The "open" ordering (by rank) applies only when every requested status is open.
  const openOnly = !all && statuses.length > 0 && statuses.every((s) => s === 'open')
  const extra: (SQL | undefined)[] = [
    input.teamId ? eq(issues.teamId, input.teamId) : undefined,
    input.horizon ? eq(issues.horizon, input.horizon) : undefined,
    all || !statuses.length ? undefined : statuses.length === 1 ? eq(issues.status, statuses[0]!) : inArray(issues.status, statuses),
    input.ownerId ? eq(issues.ownerId, input.ownerId) : undefined,
  ]
  return ctx.db
    .select()
    .from(issues)
    .where(scoped(issues, ctx, ...extra))
    .orderBy(openOnly ? asc(issues.rank) : desc(issues.updatedAt), asc(issues.createdAt))
    .limit(Math.min(input.limit ?? 200, 500))
}

export async function getIssue(ctx: Ctx, id: string): Promise<IssueRow> {
  requireRead(ctx)
  const [i] = await ctx.db.select().from(issues).where(scoped(issues, ctx, eq(issues.id, id))).limit(1)
  return found(i, 'Issue')
}
