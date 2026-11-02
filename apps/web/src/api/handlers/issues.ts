import { execute, getIssue, issueCreate, issueDrop, issueMove, issueReopen, issueSetRank, issueSolve, issueUpdate, listIssues } from '@motion/core'
import { fromExecute } from '../respond'
import type { ApiRequest, HandlerMap } from '../types'

const body = async (req: ApiRequest) => ((await req.json()) ?? {}) as Record<string, unknown>
const opts = (req: ApiRequest) => ({ requestId: req.requestId, expectedVersion: req.expectedVersion })

/** REST handlers for the issues area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /issues': async ({ ctx, query }) =>
    listIssues(ctx, {
      teamId: query.get('teamId') ?? undefined,
      horizon: (query.get('horizon') as 'short' | 'long' | null) ?? undefined,
      status: (query.get('status') as 'open' | 'solved' | 'dropped' | 'all' | null) ?? undefined,
      ownerId: query.get('ownerId') ?? undefined,
      limit: query.get('limit') ? Number(query.get('limit')) : undefined,
    }),
  'GET /issues/:id': async ({ ctx, params }) => getIssue(ctx, params.id!),
  'POST /issues': async (req) => fromExecute(await execute(req.ctx, issueCreate, (await body(req)) as never, opts(req)), 201),
  'PATCH /issues/:id': async (req) => fromExecute(await execute(req.ctx, issueUpdate, { ...(await body(req)), issueId: req.params.id! } as never, opts(req))),
  'POST /issues/:id/rank': async (req) => fromExecute(await execute(req.ctx, issueSetRank, { ...(await body(req)), issueId: req.params.id! } as never, opts(req))),
  'POST /issues/:id/solve': async (req) => fromExecute(await execute(req.ctx, issueSolve, { issueId: req.params.id! }, opts(req))),
  'POST /issues/:id/reopen': async (req) => fromExecute(await execute(req.ctx, issueReopen, { issueId: req.params.id! }, opts(req))),
  'POST /issues/:id/drop': async (req) => fromExecute(await execute(req.ctx, issueDrop, { issueId: req.params.id! }, opts(req))),
  'POST /issues/:id/move': async (req) => fromExecute(await execute(req.ctx, issueMove, { ...(await body(req)), issueId: req.params.id! } as never, opts(req))),
}
