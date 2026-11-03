import { and, asc, eq, isNull } from 'drizzle-orm'
import { agents, auditEvents, people } from '@movara/db'
import type { Ctx, Scope } from '../ctx'
import { MovaraError } from '../errors'
import { base, newId, scoped } from '../helpers'

export type CoachAgentRow = typeof agents.$inferSelect

/** Scopes of the built-in Coach. Its effective permissions are further capped by the chatting person's role. */
export const COACH_SCOPES: Scope[] = ['read', 'write:todos', 'write:issues', 'write:headlines', 'write:metrics', 'write:priorities', 'write:meetings', 'capture:meetings']

const find = async (ctx: Ctx) =>
  (await ctx.db.select().from(agents).where(scoped(agents, ctx, eq(agents.kind, 'builtin_coach'))).limit(1))[0]

/**
 * The org's built-in Coach agent record, created lazily (one per org, enforced by a unique index). It is not shown in
 * Settings -> Agents and cannot be revoked, re-scoped or given keys. Call with a person's ctx.
 */
export async function ensureCoachAgent(ctx: Ctx): Promise<CoachAgentRow> {
  if (ctx.actor.type !== 'person') throw new MovaraError('forbidden', 'Coach is started by a person')
  const existing = await find(ctx)
  if (existing) return existing
  // Owner column is required: use the org's first owner (Coach always acts on behalf of the chatting person, not the owner).
  const [owner] = await ctx.db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.orgId, ctx.orgId), eq(people.role, 'owner'), isNull(people.deletedAt)))
    .orderBy(asc(people.createdAt))
    .limit(1)
  const ownerId = owner?.id ?? ctx.actor.id
  const row = { ...base(ctx), name: 'Coach', client: 'Movara built-in', ownerPersonId: ownerId, scopes: [...COACH_SCOPES], kind: 'builtin_coach', preset: null, status: 'active' as const }
  const inserted = await ctx.db.insert(agents).values(row).onConflictDoNothing().returning()
  if (inserted[0]) {
    await ctx.db.insert(auditEvents).values({
      id: newId(), orgId: ctx.orgId, actor: ctx.actor, onBehalfOf: null, command: 'agents.ensure_coach',
      entityType: 'agent', entityId: inserted[0].id, diff: { after: { name: 'Coach', kind: 'builtin_coach' } }, requestId: null,
    })
    return inserted[0]
  }
  const again = await find(ctx)
  if (!again) throw new MovaraError('conflict', 'Could not create the Coach agent')
  return again
}

/**
 * The Ctx Coach uses to act for `personCtx`'s person: actor = the Coach agent `onBehalfOf` the person, `role` = the
 * person's role (never broader), scopes = COACH_SCOPES. Pass it to `execute()` / queries / the MCP tool registry.
 */
export async function coachCtxFor(personCtx: Ctx): Promise<Ctx> {
  const agent = await ensureCoachAgent(personCtx)
  return { db: personCtx.db, orgId: personCtx.orgId, actor: { type: 'agent', id: agent.id, onBehalfOf: personCtx.actor.id }, scopes: [...COACH_SCOPES], role: personCtx.role }
}

