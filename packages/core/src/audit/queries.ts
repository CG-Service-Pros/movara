import { and, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm'
import { auditEvents } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { decodeCursor, encodeCursor } from '../helpers'

export type AuditEventRow = typeof auditEvents.$inferSelect

export type ListAuditInput = {
  actorId?: string
  actorType?: 'person' | 'agent'
  /** Events by an agent OR on behalf of this person. */
  onBehalfOf?: string
  command?: string
  /** Prefix match, e.g. "priority." */
  commandPrefix?: string
  entityType?: string
  entityId?: string
  since?: Date
  until?: Date
  limit?: number
  cursor?: string
}

/** Newest first, keyset-paginated. */
export async function listAudit(ctx: Ctx, input: ListAuditInput = {}): Promise<{ items: AuditEventRow[]; nextCursor: string | null }> {
  requireRead(ctx)
  const limit = Math.min(input.limit ?? 50, 200)
  const cur = input.cursor ? decodeCursor(input.cursor) : null
  const rows = await ctx.db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, ctx.orgId),
        input.actorId ? sql`${auditEvents.actor}->>'id' = ${input.actorId}` : undefined,
        input.actorType ? sql`${auditEvents.actor}->>'type' = ${input.actorType}` : undefined,
        input.onBehalfOf ? eq(auditEvents.onBehalfOf, input.onBehalfOf) : undefined,
        input.command ? eq(auditEvents.command, input.command) : undefined,
        input.commandPrefix ? sql`${auditEvents.command} like ${input.commandPrefix.replace(/[%_]/g, '\\$&') + '%'}` : undefined,
        input.entityType ? eq(auditEvents.entityType, input.entityType) : undefined,
        input.entityId ? eq(auditEvents.entityId, input.entityId) : undefined,
        input.since ? gte(auditEvents.at, input.since) : undefined,
        input.until ? lte(auditEvents.at, input.until) : undefined,
        cur ? or(lt(auditEvents.at, cur.at), and(eq(auditEvents.at, cur.at), lt(auditEvents.id, cur.id))) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit + 1)
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.at, last.id) : null }
}
