import { and, desc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { auditEvents, milestones } from '@movara/db'
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

export type ListActivityInput = {
  entityType: string
  entityId: string
  /** For a priority: also include the events of its milestones (default true). Ignored for other entity types. */
  includeChildren?: boolean
  limit?: number
}

/**
 * Activity of one entity, newest first. For a priority this also returns its milestones' events
 * (including milestones that were deleted since), which is what the priority's activity feed shows.
 */
export async function listActivity(ctx: Ctx, input: ListActivityInput): Promise<AuditEventRow[]> {
  requireRead(ctx)
  const own = and(eq(auditEvents.entityType, input.entityType), eq(auditEvents.entityId, input.entityId))
  let where = own
  if (input.entityType === 'priority' && input.includeChildren !== false) {
    const ms = await ctx.db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.orgId, ctx.orgId), eq(milestones.priorityId, input.entityId)))
    where = or(
      own,
      and(eq(auditEvents.entityType, 'milestone'), or(ms.length ? inArray(auditEvents.entityId, ms.map((m) => m.id)) : undefined, sql`${auditEvents.diff}->>'priorityId' = ${input.entityId}`)),
    )
  }
  return ctx.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.orgId, ctx.orgId), where))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(Math.min(input.limit ?? 50, 200))
}
