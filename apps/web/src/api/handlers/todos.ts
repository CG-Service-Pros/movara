import { execute, getTodo, listTodos, todoComplete, todoCreate, todoDelete, todoUncomplete, todoUpdate } from '@motion/core'
import { fromExecute } from '../respond'
import type { ApiRequest, HandlerMap } from '../types'

const body = async (req: ApiRequest) => ((await req.json()) ?? {}) as Record<string, unknown>
const opts = (req: ApiRequest) => ({ requestId: req.requestId, expectedVersion: req.expectedVersion })

/** REST handlers for the todos area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /todos': async ({ ctx, query }) =>
    listTodos(ctx, {
      ownerId: query.get('ownerId') ?? undefined,
      teamId: query.get('teamId') ?? undefined,
      personal: query.get('personal') === 'true' ? true : undefined,
      status: (query.get('status')?.split(',') as ('open' | 'pending' | 'done')[] | undefined) ?? undefined,
      overdue: query.get('overdue') === 'true' ? true : undefined,
      limit: query.get('limit') ? Number(query.get('limit')) : undefined,
    }),
  'GET /todos/:id': async ({ ctx, params }) => getTodo(ctx, params.id!),
  'POST /todos': async (req) => fromExecute(await execute(req.ctx, todoCreate, (await body(req)) as never, opts(req)), 201),
  'PATCH /todos/:id': async (req) => fromExecute(await execute(req.ctx, todoUpdate, { ...(await body(req)), todoId: req.params.id! } as never, opts(req))),
  'POST /todos/:id/complete': async (req) => fromExecute(await execute(req.ctx, todoComplete, { todoId: req.params.id! }, opts(req))),
  'POST /todos/:id/uncomplete': async (req) => fromExecute(await execute(req.ctx, todoUncomplete, { todoId: req.params.id! }, opts(req))),
  'DELETE /todos/:id': async (req) => fromExecute(await execute(req.ctx, todoDelete, { todoId: req.params.id! }, opts(req))),
}
