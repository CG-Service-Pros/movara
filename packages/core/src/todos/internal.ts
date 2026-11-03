import type { Source } from '@movara/db'
import { todos } from '@movara/db'
import { addDays, todayIn } from '../calendar'
import { actingPersonId, hasScope, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { base } from '../helpers'
import { assertPeople, assertTeam, orgCalendar, ownersOrSelf } from '../issues/internal'

export type NewTodo = {
  title: string
  description?: string | null
  ownerIds?: string[] | null
  /** null/undefined = personal to-do. */
  teamId?: string | null
  /** Default: today (org timezone) + 7 days. */
  dueDate?: string | null
  source?: Source
}

/** Fan out one to-do per owner. */
export async function insertTodos(ctx: Ctx, t: NewTodo) {
  const owners = ownersOrSelf(ctx, t.ownerIds)
  await assertPeople(ctx, owners)
  const teamId = t.teamId ?? null
  if (teamId) await assertTeam(ctx, teamId)
  const dueDate = t.dueDate ?? addDays(todayIn(await orgCalendar(ctx)), 7)
  return ctx.db
    .insert(todos)
    .values(owners.map((ownerId) => ({ ...base(ctx), title: t.title, description: t.description ?? null, ownerId, teamId, dueDate, status: 'open' as const, source: t.source ?? null })))
    .returning()
}

/**
 * An agent holding `write:own_todos` but not `write:todos` may only create/complete to-dos owned by the person it
 * acts for. Persons and agents with `write:todos` are unrestricted.
 */
export const ownTodosOnly = (ctx: Ctx): boolean => ctx.actor.type === 'agent' && !hasScope(ctx, 'write:todos')

export function assertOwnTodoOwners(ctx: Ctx, ownerIds: string[]): void {
  if (!ownTodosOnly(ctx)) return
  const me = actingPersonId(ctx)
  if (ownerIds.some((o) => o !== me)) {
    throw new MovaraError('forbidden_scope', 'This agent may only create to-dos for its own owner (scope write:own_todos). Set owner to the agent\'s owner or ask for the write:todos scope.', { scope: 'write:todos' })
  }
}
