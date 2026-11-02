import { desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm'
import { headlines } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type HeadlineRow = typeof headlines.$inferSelect

export type ListHeadlinesInput = {
  teamId?: string
  ownerId?: string
  /** true = reviewed only, false = still to review. */
  reviewed?: boolean
  limit?: number
}

export async function listHeadlines(ctx: Ctx, input: ListHeadlinesInput = {}): Promise<HeadlineRow[]> {
  requireRead(ctx)
  const extra: (SQL | undefined)[] = [
    input.teamId ? eq(headlines.teamId, input.teamId) : undefined,
    input.ownerId ? eq(headlines.ownerId, input.ownerId) : undefined,
    input.reviewed === undefined ? undefined : input.reviewed ? isNotNull(headlines.reviewedAt) : isNull(headlines.reviewedAt),
  ]
  return ctx.db
    .select()
    .from(headlines)
    .where(scoped(headlines, ctx, ...extra))
    .orderBy(desc(headlines.createdAt))
    .limit(Math.min(input.limit ?? 200, 500))
}

export async function getHeadline(ctx: Ctx, id: string): Promise<HeadlineRow> {
  requireRead(ctx)
  const [h] = await ctx.db.select().from(headlines).where(scoped(headlines, ctx, eq(headlines.id, id))).limit(1)
  return found(h, 'Headline')
}
