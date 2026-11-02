import type { Source } from '@motion/db'
import { todos } from '@motion/db'
import { addDays, todayIn } from '../calendar'
import type { Ctx } from '../ctx'
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
