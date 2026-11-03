import { asc, eq, inArray, isNull, lt, ne, sql, type SQL, and } from 'drizzle-orm'
import { todos } from '@movara/db'
import { todayIn } from '../calendar'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'
import { orgCalendar } from '../issues/internal'

export type TodoRow = typeof todos.$inferSelect
type TodoStatus = 'open' | 'pending' | 'done'

export type ListTodosInput = {
  ownerId?: string
  teamId?: string
  /** true = only personal (no team) to-dos. */
  personal?: boolean
  status?: TodoStatus | TodoStatus[]
  /** true = due before today (org timezone) and not done. */
  overdue?: boolean
  limit?: number
}

export async function listTodos(ctx: Ctx, input: ListTodosInput = {}): Promise<TodoRow[]> {
  requireRead(ctx)
  const statuses = input.status ? (Array.isArray(input.status) ? input.status : [input.status]) : null
  const extra: (SQL | undefined)[] = [
    input.ownerId ? eq(todos.ownerId, input.ownerId) : undefined,
    input.teamId ? eq(todos.teamId, input.teamId) : undefined,
    input.personal ? isNull(todos.teamId) : undefined,
    statuses ? inArray(todos.status, statuses) : undefined,
  ]
  if (input.overdue) {
    const today = todayIn(await orgCalendar(ctx))
    extra.push(and(lt(todos.dueDate, today), ne(todos.status, 'done')))
  }
  return ctx.db
    .select()
    .from(todos)
    .where(scoped(todos, ctx, ...extra))
    .orderBy(sql`${todos.dueDate} asc nulls last`, asc(todos.createdAt))
    .limit(Math.min(input.limit ?? 200, 500))
}

export async function getTodo(ctx: Ctx, id: string): Promise<TodoRow> {
  requireRead(ctx)
  const [t] = await ctx.db.select().from(todos).where(scoped(todos, ctx, eq(todos.id, id))).limit(1)
  return found(t, 'To-do')
}
