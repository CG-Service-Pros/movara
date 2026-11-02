import { and, eq, isNull } from 'drizzle-orm'
import { agents, orgs, people, type ActorJson, type Db, type Role } from '@motion/db'
import { MotionError } from './errors'

export const SCOPES = [
  'read',
  'write:todos',
  'write:issues',
  'write:headlines',
  'write:metrics',
  'write:priorities',
  'write:meetings',
  'propose:vision',
  'propose:chart',
  'admin',
] as const
export type Scope = (typeof SCOPES)[number]

export type Actor = ActorJson
export type { Role }

/** Role order, lowest to highest. */
export const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }

export type Ctx = {
  /** Drizzle handle. Inside a command's `run` this is the transaction. */
  db: Db
  orgId: string
  actor: Actor
  /** People: 'all' (limited by role). Agents: the agent's scopes (narrowed by the API key, if any). */
  scopes: Scope[] | 'all'
  /** People: their role. Agents: the role of the person they act for (the owner). */
  role: Role
}

export const hasScope = (ctx: Ctx, scope: Scope): boolean =>
  ctx.scopes === 'all' || ctx.scopes.includes(scope)

export const hasRole = (ctx: Ctx, min: Role): boolean => ROLE_RANK[ctx.role] >= ROLE_RANK[min]

/** Throws forbidden_scope unless ctx holds the scope. */
export function requireScope(ctx: Ctx, scope: Scope): void {
  if (!hasScope(ctx, scope)) throw new MotionError('forbidden_scope', `Missing scope: ${scope}`, { scope })
}

/** Throws forbidden unless ctx has at least the given role. */
export function requireRole(ctx: Ctx, min: Role): void {
  if (!hasRole(ctx, min)) throw new MotionError('forbidden', `Requires role ${min} or higher`, { role: ctx.role, required: min })
}

/** Call at the top of every query: agents need the `read` scope. */
export const requireRead = (ctx: Ctx): void => requireScope(ctx, 'read')

/** Person id the ctx acts as/for (the person themself, or the agent's owner). */
export const actingPersonId = (ctx: Ctx): string => (ctx.actor.type === 'person' ? ctx.actor.id : (ctx.actor.onBehalfOf as string))

/** Build a Ctx for a person. Throws not_found if the person is not an active member of the org. */
export async function ctxForPerson(db: Db, orgId: string, personId: string): Promise<Ctx> {
  const [p] = await db
    .select({ id: people.id, role: people.role })
    .from(people)
    .where(and(eq(people.orgId, orgId), eq(people.id, personId), isNull(people.deletedAt)))
    .limit(1)
  if (!p) throw new MotionError('not_found', 'Person not found in this organization')
  return { db, orgId, actor: { type: 'person', id: p.id }, scopes: 'all', role: p.role }
}

/** Build a Ctx for an agent. `keyScopes` (from an API key) can only narrow the agent's scopes. */
export async function ctxForAgent(db: Db, orgId: string, agentId: string, keyScopes?: string[] | null): Promise<Ctx> {
  const [a] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.id, agentId), isNull(agents.deletedAt)))
    .limit(1)
  if (!a) throw new MotionError('not_found', 'Agent not found')
  if (a.status !== 'active') throw new MotionError('forbidden', `Agent is ${a.status}`)
  const [owner] = await db
    .select({ id: people.id, role: people.role })
    .from(people)
    .where(and(eq(people.orgId, orgId), eq(people.id, a.ownerPersonId), isNull(people.deletedAt)))
    .limit(1)
  if (!owner) throw new MotionError('forbidden', "The agent's owner is no longer a member of this organization")
  const scopes = (keyScopes && keyScopes.length ? a.scopes.filter((s) => keyScopes.includes(s)) : a.scopes) as Scope[]
  return { db, orgId, actor: { type: 'agent', id: a.id, onBehalfOf: owner.id }, scopes, role: owner.role }
}

/** Ctx for a signed-in Better Auth user in an org (by slug or id). Returns null when not a member. */
export async function ctxForUser(db: Db, org: { slug: string } | { id: string }, userId: string): Promise<Ctx | null> {
  const [row] = await db
    .select({ orgId: orgs.id, personId: people.id, role: people.role })
    .from(people)
    .innerJoin(orgs, eq(orgs.id, people.orgId))
    .where(
      and(
        'slug' in org ? eq(orgs.slug, org.slug) : eq(orgs.id, org.id),
        eq(people.userId, userId),
        isNull(people.deletedAt),
        isNull(orgs.deletedAt),
      ),
    )
    .limit(1)
  if (!row) return null
  return { db, orgId: row.orgId, actor: { type: 'person', id: row.personId }, scopes: 'all', role: row.role }
}
