import { execute, getVision, getVisionRevision, listVisionRevisions, visionCreateDraft, visionDiscardDraft, visionProposeChange, visionPublish, visionUpdateDraft } from '@movara/core'
import { fromExecute } from '../respond'
import type { HandlerMap } from '../types'

const body = async (json: () => Promise<unknown>) => ((await json()) ?? {}) as Record<string, unknown>

/** REST handlers for the vision area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  /** ?teamId= for a team plan; default is the company plan. */
  'GET /vision': ({ ctx, query }) => getVision(ctx, { teamId: query.get('teamId') ?? undefined }),
  'GET /vision/revisions': ({ ctx, query }) => listVisionRevisions(ctx, { teamId: query.get('teamId') ?? undefined }),
  'GET /vision/revisions/:id': ({ ctx, params }) => getVisionRevision(ctx, params.id!),
  'POST /vision/drafts': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, visionCreateDraft, (await body(json).catch(() => ({}))) as never, { requestId }), 201),
  'PATCH /vision/revisions/:id': async ({ ctx, params, json, requestId, expectedVersion }) =>
    fromExecute(await execute(ctx, visionUpdateDraft, { sections: await body(json), revisionId: params.id! } as never, { requestId, expectedVersion })),
  'DELETE /vision/revisions/:id': async ({ ctx, params, requestId }) => fromExecute(await execute(ctx, visionDiscardDraft, { revisionId: params.id! }, { requestId })),
  'POST /vision/revisions/:id/publish': async ({ ctx, params, requestId, expectedVersion }) => fromExecute(await execute(ctx, visionPublish, { revisionId: params.id! }, { requestId, expectedVersion })),
  /** Agents get 202 { needsApproval }. Body: { section, op: add_goal|add_core_value|add_long_term_issue|set, text?, issueId?, value?, source?, teamId? } */
  'POST /vision/proposals': async ({ ctx, json, requestId }) => fromExecute(await execute(ctx, visionProposeChange, (await body(json)) as never, { requestId })),
}
