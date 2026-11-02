'use server'

import { execute, todoComplete, todoCreate, todoDelete, todoUncomplete, todoUpdate } from '@motion/core'
import { runAction, type ActionResult } from '@/components/issues/action'

const paths = ['todos', 'issues', 'meetings']

export async function createTodosAction(slug: string, input: { title: string; description?: string; ownerIds: string[]; teamId: string | null; dueDate?: string; source?: { type: string; id: string } | null }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) =>
    execute(ctx, todoCreate, {
      title: input.title,
      description: input.description || undefined,
      ownerIds: input.ownerIds.length ? input.ownerIds : undefined,
      teamId: input.teamId,
      dueDate: input.dueDate || undefined,
      source: input.source ?? undefined,
    }),
  )
}

export async function setTodoDoneAction(slug: string, todoId: string, done: boolean): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => (done ? execute(ctx, todoComplete, { todoId }) : execute(ctx, todoUncomplete, { todoId })))
}

export async function updateTodoAction(slug: string, input: { todoId: string; title?: string; description?: string | null; ownerId?: string | null; teamId?: string | null; dueDate?: string | null }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, todoUpdate, input))
}

export async function deleteTodoAction(slug: string, todoId: string): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, todoDelete, { todoId }))
}
