import {
  execute, getPriority, listPriorities, milestoneAdd, milestoneDelete, milestoneToggle, milestoneUpdate, priorityCascade, priorityCreate, priorityDelete, prioritiesSummary,
  prioritySetStatus, priorityUpdate, MovaraError,
} from '@movara/core'
import { fromExecute } from '../respond'
import type { HandlerMap } from '../types'

type Status = 'on_track' | 'off_track' | 'done' | 'not_done' | 'dropped'
const body = async (json: () => Promise<unknown>) => ((await json()) ?? {}) as Record<string, unknown>

/** REST handlers for the priorities area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /priorities': ({ ctx, query }) =>
    listPriorities(ctx, {
      quarter: query.get('quarter') ?? undefined,
      teamId: query.get('teamId') ?? undefined,
      ownerId: query.get('ownerId') ?? undefined,
      status: (query.get('status')?.split(',').filter(Boolean) as Status[] | undefined) ?? undefined,
      level: (query.get('level') as 'company' | 'team' | 'individual' | null) ?? undefined,
    }),
  'GET /priorities/summary': ({ ctx, query }) => prioritiesSummary(ctx, { quarter: query.get('quarter') ?? undefined, teamId: query.get('teamId') ?? undefined }),
  'GET /priorities/:id': ({ ctx, params }) => getPriority(ctx, params.id!),
  'POST /priorities': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, priorityCreate, (await body(json)) as never, { requestId }), 201),
  'PATCH /priorities/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, priorityUpdate, { ...(await body(json)), priorityId: params.id! } as never, { requestId, expectedVersion })),
  'POST /priorities/:id/status': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, prioritySetStatus, { ...(await body(json)), priorityId: params.id! } as never, { requestId, expectedVersion })),
  'POST /priorities/:id/cascade': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, priorityCascade, { ...(await body(json)), priorityId: params.id! } as never, { requestId }), 201),
  'DELETE /priorities/:id': async ({ ctx, params, requestId, expectedVersion }) => fromExecute(await execute(ctx, priorityDelete, { priorityId: params.id! }, { requestId, expectedVersion })),
  'POST /priorities/:id/milestones': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, milestoneAdd, { ...(await body(json)), priorityId: params.id! } as never, { requestId }), 201),
  'PATCH /milestones/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, milestoneUpdate, { ...(await body(json)), milestoneId: params.id! } as never, { requestId, expectedVersion })),
  'POST /milestones/:id/toggle': async ({ ctx, params, json, requestId, expectedVersion }) => {
    const b = await body(json).catch((e) => { if (e instanceof MovaraError) return {}; throw e })
    return fromExecute(await execute(ctx, milestoneToggle, { ...b, milestoneId: params.id! } as never, { requestId, expectedVersion }))
  },
  'DELETE /milestones/:id': async ({ ctx, params, requestId, expectedVersion }) => fromExecute(await execute(ctx, milestoneDelete, { milestoneId: params.id! }, { requestId, expectedVersion })),
}
