import { isMotionError, type ExecuteResult } from '@motion/core'

export const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers })

/**
 * Map a command result to a Response: ok -> 200/201 { ok, data, entity, auditId };
 * needs approval -> 202 { needsApproval, approvalId }.
 */
export function fromExecute<O>(r: ExecuteResult<O>, status = 200): Response {
  if (r.ok) return json({ ok: true, data: r.data, entity: r.entity, auditId: r.auditId, replayed: r.replayed }, status)
  return json({ ok: false, needsApproval: true, approvalId: r.approvalId }, 202)
}

export function errorResponse(e: unknown): Response {
  if (isMotionError(e)) return json(e.toJSON(), e.status)
  console.error('[api] unexpected error', e)
  return json({ error: { code: 'internal', message: 'Internal error' } }, 500)
}

