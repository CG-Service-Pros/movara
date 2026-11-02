import {
  chartAddSeat, chartAssignPeople, chartCreateDraft, chartDeleteSeat, chartDiscardDraft, chartMoveSeat, chartProposeChange, chartPublish, chartReorderSeats, chartSetAssistingAgents,
  chartUpdateSeat, execute, getChart, getChartRevision, listChartRevisions,
} from '@motion/core'
import { fromExecute } from '../respond'
import type { HandlerMap } from '../types'

const body = async (json: () => Promise<unknown>) => ((await json()) ?? {}) as Record<string, unknown>

/** REST handlers for the chart area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /chart': ({ ctx }) => getChart(ctx),
  'GET /chart/revisions': ({ ctx }) => listChartRevisions(ctx),
  'GET /chart/revisions/:id': ({ ctx, params }) => getChartRevision(ctx, params.id!),
  /** Body: { from?: 'published' | 'blank' | 'template' } */
  'POST /chart/drafts': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, chartCreateDraft, (await body(json).catch(() => ({}))) as never, { requestId }), 201),
  'DELETE /chart/revisions/:id': async ({ ctx, params, requestId }) => fromExecute(await execute(ctx, chartDiscardDraft, { revisionId: params.id! }, { requestId })),
  'POST /chart/revisions/:id/publish': async ({ ctx, params, requestId, expectedVersion }) => fromExecute(await execute(ctx, chartPublish, { revisionId: params.id! }, { requestId, expectedVersion })),
  'POST /chart/revisions/:id/seats': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, chartAddSeat, { ...(await body(json)), revisionId: params.id! } as never, { requestId }), 201),
  'POST /chart/revisions/:id/reorder': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, chartReorderSeats, { ...(await body(json)), revisionId: params.id! } as never, { requestId })),
  'PATCH /chart/seats/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, chartUpdateSeat, { ...(await body(json)), seatId: params.id! } as never, { requestId, expectedVersion })),
  'POST /chart/seats/:id/move': async ({ ctx, params, json, requestId }) => fromExecute(await execute(ctx, chartMoveSeat, { ...(await body(json)), seatId: params.id! } as never, { requestId })),
  'DELETE /chart/seats/:id': async ({ ctx, params, requestId }) => fromExecute(await execute(ctx, chartDeleteSeat, { seatId: params.id! }, { requestId })),
  'PUT /chart/seats/:id/people': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, chartAssignPeople, { ...(await body(json)), seatId: params.id! } as never, { requestId })),
  'PUT /chart/seats/:id/agents': async ({ ctx, params, json, requestId }) =>
    fromExecute(await execute(ctx, chartSetAssistingAgents, { ...(await body(json)), seatId: params.id! } as never, { requestId })),
  /** Agents get 202 { needsApproval }. Body: { ops: [...], reason?, publish? } */
  'POST /chart/proposals': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, chartProposeChange, (await body(json)) as never, { requestId })),
}
