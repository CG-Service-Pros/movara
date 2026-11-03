import { captureAcceptItems, captureRejectItems, captureSettingsUpdate, execute, getCaptureSettings, listPendingCaptures } from '@movara/core'
import { fromExecute } from '../respond'
import type { ApiRequest, HandlerMap } from '../types'

const body = async (req: ApiRequest) => ((await req.json()) ?? {}) as Record<string, unknown>
const opts = (req: ApiRequest) => ({ requestId: req.requestId, expectedVersion: req.expectedVersion })

/** REST handlers for meeting-notes capture review. Capturing itself is POST /meetings/:id/notes. */
export const handlers: HandlerMap = {
  'GET /capture/pending': async ({ ctx, query }) => listPendingCaptures(ctx, { meetingId: query.get('meetingId') ?? undefined, limit: query.get('limit') ? Number(query.get('limit')) : undefined }),
  'POST /capture/accept': async (req) => fromExecute(await execute(req.ctx, captureAcceptItems, (await body(req)) as never, opts(req))),
  'POST /capture/reject': async (req) => fromExecute(await execute(req.ctx, captureRejectItems, (await body(req)) as never, opts(req))),
  'GET /capture/settings': async ({ ctx }) => getCaptureSettings(ctx),
  'PUT /capture/settings': async (req) => fromExecute(await execute(req.ctx, captureSettingsUpdate, (await body(req)) as never, opts(req))),
}
