import { execute, getHeadline, headlineCascade, headlineDelete, headlineMarkReviewed, headlinePost, headlineUpdate, listHeadlines } from '@movara/core'
import { fromExecute } from '../respond'
import type { ApiRequest, HandlerMap } from '../types'

const body = async (req: ApiRequest) => ((await req.json()) ?? {}) as Record<string, unknown>
const opts = (req: ApiRequest) => ({ requestId: req.requestId, expectedVersion: req.expectedVersion })

/** REST handlers for the headlines area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /headlines': async ({ ctx, query }) =>
    listHeadlines(ctx, {
      teamId: query.get('teamId') ?? undefined,
      ownerId: query.get('ownerId') ?? undefined,
      reviewed: query.get('reviewed') === null ? undefined : query.get('reviewed') === 'true',
      limit: query.get('limit') ? Number(query.get('limit')) : undefined,
    }),
  'GET /headlines/:id': async ({ ctx, params }) => getHeadline(ctx, params.id!),
  'POST /headlines': async (req) => fromExecute(await execute(req.ctx, headlinePost, (await body(req)) as never, opts(req)), 201),
  'PATCH /headlines/:id': async (req) => fromExecute(await execute(req.ctx, headlineUpdate, { ...(await body(req)), headlineId: req.params.id! } as never, opts(req))),
  'POST /headlines/:id/review': async (req) => fromExecute(await execute(req.ctx, headlineMarkReviewed, { ...(await body(req)), headlineId: req.params.id! } as never, opts(req))),
  'POST /headlines/:id/cascade': async (req) => fromExecute(await execute(req.ctx, headlineCascade, { ...(await body(req)), headlineId: req.params.id! } as never, opts(req))),
  'DELETE /headlines/:id': async (req) => fromExecute(await execute(req.ctx, headlineDelete, { headlineId: req.params.id! }, opts(req))),
}
