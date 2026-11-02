import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { approvals } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { decodeCursor, encodeCursor, found, scoped } from '../helpers'

export type ApprovalRow = typeof approvals.$inferSelect

export type ListApprovalsInput = {
  status?: 'pending' | 'approved' | 'declined'
  /** Only approvals requested by this actor id (an agent polling its own requests). */
  requestedBy?: string
  limit?: number
  cursor?: string
}

export async function listApprovals(ctx: Ctx, input: ListApprovalsInput = {}): Promise<{ items: ApprovalRow[]; nextCursor: string | null }> {
  requireRead(ctx)
  const limit = Math.min(input.limit ?? 50, 200)
  const cur = input.cursor ? decodeCursor(input.cursor) : null
  const rows = await ctx.db
    .select()
    .from(approvals)
    .where(
      scoped(
        approvals,
        ctx,
        input.status ? eq(approvals.status, input.status) : undefined,
        input.requestedBy ? sql`${approvals.requestedByActor}->>'id' = ${input.requestedBy}` : undefined,
        cur ? or(lt(approvals.createdAt, cur.at), and(eq(approvals.createdAt, cur.at), lt(approvals.id, cur.id))) : undefined,
      ),
    )
    .orderBy(desc(approvals.createdAt), desc(approvals.id))
    .limit(limit + 1)
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null }
}

export async function getApproval(ctx: Ctx, id: string): Promise<ApprovalRow> {
  requireRead(ctx)
  const [a] = await ctx.db.select().from(approvals).where(scoped(approvals, ctx, eq(approvals.id, id))).limit(1)
  return found(a, 'Approval')
}
