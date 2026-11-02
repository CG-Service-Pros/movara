import { asc, desc, eq, type SQL } from 'drizzle-orm'
import { issues } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type IssueRow = typeof issues.$inferSelect

export type ListIssuesInput = {
  teamId?: string
  horizon?: 'short' | 'long'
  /** Default: 'open'. */
  status?: 'open' | 'solved' | 'dropped' | 'all'
  ownerId?: string
  limit?: number
}

/** Issues ordered by rank (open) or most recently solved first. */
export async function listIssues(ctx: Ctx, input: ListIssuesInput = {}): Promise<IssueRow[]> {
  requireRead(ctx)
  const status = input.status ?? 'open'
  const extra: (SQL | undefined)[] = [
    input.teamId ? eq(issues.teamId, input.teamId) : undefined,
    input.horizon ? eq(issues.horizon, input.horizon) : undefined,
    status !== 'all' ? eq(issues.status, status) : undefined,
    input.ownerId ? eq(issues.ownerId, input.ownerId) : undefined,
  ]
  return ctx.db
    .select()
    .from(issues)
    .where(scoped(issues, ctx, ...extra))
    .orderBy(status === 'open' ? asc(issues.rank) : desc(issues.updatedAt), asc(issues.createdAt))
    .limit(Math.min(input.limit ?? 200, 500))
}

export async function getIssue(ctx: Ctx, id: string): Promise<IssueRow> {
  requireRead(ctx)
  const [i] = await ctx.db.select().from(issues).where(scoped(issues, ctx, eq(issues.id, id))).limit(1)
  return found(i, 'Issue')
}
