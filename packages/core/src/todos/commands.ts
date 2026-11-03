import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '@movara/db'
import type { Ctx } from '../ctx'
import { assertVersion, found, scoped, softDelete, touch } from '../helpers'
import { assertPeople, assertTeam, dateSchema, sourceSchema } from '../issues/internal'
import { addToLiveMeetings, bumpLiveRev, findLiveMeetingIds } from '../meetings/live'
import { defineCommand } from '../runner'
import { insertTodos } from './internal'

type TodoRow = typeof todos.$inferSelect
const snap = (r: TodoRow) => ({ title: r.title, description: r.description, ownerId: r.ownerId, teamId: r.teamId, dueDate: r.dueDate, status: r.status })

async function load(ctx: Ctx, id: string): Promise<TodoRow> {
  const [r] = await ctx.db.select().from(todos).where(scoped(todos, ctx, eq(todos.id, id))).limit(1)
  return found(r, 'To-do')
}

async function save(ctx: Ctx, before: TodoRow, patch: Partial<typeof todos.$inferInsert>) {
  const [after] = await ctx.db.update(todos).set({ ...patch, ...touch(todos, ctx) }).where(scoped(todos, ctx, eq(todos.id, before.id))).returning()
  await bumpLiveRev(ctx, [before.teamId, after!.teamId])
  return { data: after!, entity: { type: 'todo', id: before.id }, before: snap(before), after: snap(after!) }
}

export const todoCreate = defineCommand({
  name: 'todo.create',
  scope: 'write:todos',
  input: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10_000).nullable().optional(),
    /** One to-do is created per owner. Default: the acting person. */
    ownerIds: z.array(z.uuid()).max(50).optional(),
    /** Omit/null = personal to-do. */
    teamId: z.uuid().nullable().optional(),
    /** YYYY-MM-DD. Default: today + 7 days in the org timezone. */
    dueDate: dateSchema.optional(),
    source: sourceSchema.nullable().optional(),
  }),
  summary: (i) => `Create to-do "${i.title}"`,
  run: async (ctx, input) => {
    const rows = await insertTodos(ctx, input)
    await addToLiveMeetings(ctx, input.teamId, { todoIds: rows.map((r) => r.id) })
    return { data: rows, entity: { type: 'todo', id: rows[0]!.id }, before: null, after: { title: input.title, ids: rows.map((r) => r.id), ownerIds: rows.map((r) => r.ownerId), dueDate: rows[0]!.dueDate, source: input.source ?? null } }
  },
})

export const todoUpdate = defineCommand({
  name: 'todo.update',
  scope: 'write:todos',
  input: z.object({
    todoId: z.uuid(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(10_000).nullable().optional(),
    ownerId: z.uuid().nullable().optional(),
    teamId: z.uuid().nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.todoId)
    assertVersion(before, h.expectedVersion)
    if (input.ownerId) await assertPeople(ctx, [input.ownerId])
    if (input.teamId) await assertTeam(ctx, input.teamId)
    const { todoId: _id, ...patch } = input
    return save(ctx, before, patch)
  },
})

/**
 * Tick a to-do. While its team has a LIVE meeting the status becomes 'pending' (finalized to 'done'
 * when the meeting ends, so the meeting's completion rate stays honest); otherwise it is 'done'.
 */
export const todoComplete = defineCommand({
  name: 'todo.complete',
  scope: 'write:todos',
  input: z.object({ todoId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.todoId)
    assertVersion(before, h.expectedVersion)
    if (before.status !== 'open') return { data: before, entity: { type: 'todo', id: before.id } }
    const live = before.teamId ? (await findLiveMeetingIds(ctx, [before.teamId])).length > 0 : false
    return save(ctx, before, live ? { status: 'pending', doneAt: null } : { status: 'done', doneAt: new Date() })
  },
})

export const todoUncomplete = defineCommand({
  name: 'todo.uncomplete',
  scope: 'write:todos',
  input: z.object({ todoId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.todoId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'open') return { data: before, entity: { type: 'todo', id: before.id } }
    return save(ctx, before, { status: 'open', doneAt: null })
  },
})

export const todoDelete = defineCommand({
  name: 'todo.delete',
  scope: 'write:todos',
  input: z.object({ todoId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.todoId)
    assertVersion(before, h.expectedVersion)
    await ctx.db.update(todos).set(softDelete(todos, ctx)).where(scoped(todos, ctx, eq(todos.id, before.id)))
    await bumpLiveRev(ctx, [before.teamId])
    return { data: { id: before.id }, entity: { type: 'todo', id: before.id }, before: { title: before.title }, after: null }
  },
})
