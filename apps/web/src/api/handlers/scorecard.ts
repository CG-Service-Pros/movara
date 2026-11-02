import { execute, getScorecard, listScorecards, metricArchive, metricCreate, metricRecordValues, metricUpdate, offTrackMetrics, scorecardCreate, scorecardUpdateSettings } from '@motion/core'
import { fromExecute } from '../respond'
import type { HandlerMap } from '../types'

const body = async (json: () => Promise<unknown>) => ((await json()) ?? {}) as Record<string, unknown>

/** REST handlers for the scorecard area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /scorecards': ({ ctx }) => listScorecards(ctx),
  'POST /scorecards': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, scorecardCreate, (await body(json)) as never, { requestId }), 201),
  'GET /scorecards/off-track': ({ ctx }) => offTrackMetrics(ctx),
  'GET /scorecards/:id': ({ ctx, params, query }) => {
    const periods = query.get('periods')
    return getScorecard(ctx, { scorecardId: params.id!, periods: periods ? Number(periods) : undefined })
  },
  'GET /teams/:id/scorecard': ({ ctx, params, query }) => {
    const periods = query.get('periods')
    return getScorecard(ctx, { teamId: params.id!, periods: periods ? Number(periods) : undefined })
  },
  'PATCH /scorecards/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, scorecardUpdateSettings, { ...(await body(json)), scorecardId: params.id! } as never, { requestId, expectedVersion })),
  'POST /scorecards/:id/metrics': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, metricCreate, { ...(await body(json)), scorecardId: params.id! } as never, { requestId }), 201),
  'PATCH /metrics/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, metricUpdate, { ...(await body(json)), metricId: params.id! } as never, { requestId, expectedVersion })),
  'DELETE /metrics/:id': async ({ ctx, params, requestId, expectedVersion }) => fromExecute(await execute(ctx, metricArchive, { metricId: params.id! }, { requestId, expectedVersion })),
  /** Body: { scorecardId?, teamId?, values: [{ metricId | metricTitle, periodStart, value, note? }] } */
  'POST /metric-values': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, metricRecordValues, (await body(json)) as never, { requestId })),
}
