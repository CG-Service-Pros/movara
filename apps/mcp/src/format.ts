import { isMotionError, type ExecuteResult } from '@motion/core'

/** Keys that are noise for an agent (tenant plumbing, provenance blobs). */
const NOISE = new Set(['orgId', 'createdByActor', 'updatedByActor', 'deletedAt'])

/** Compact JSON: drops nulls/undefined, tenant plumbing and any extra `drop` keys, recursively. */
export function compact(value: unknown, drop: readonly string[] = []): unknown {
  const skip = new Set(drop)
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return undefined
    if (v instanceof Date) return v.toISOString()
    if (Array.isArray(v)) return v.map((x) => walk(x) ?? null)
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (NOISE.has(k) || skip.has(k)) continue
        const w = walk(x)
        if (w !== undefined) out[k] = w
      }
      return out
    }
    return v
  }
  return walk(value)
}

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

export const json = (v: unknown): string => JSON.stringify(v)
export const text = (v: unknown): ToolResult => ({ content: [{ type: 'text', text: json(v) }] })

/** Typed MotionError -> MCP tool error carrying the code. */
export function toolError(e: unknown): ToolResult {
  if (isMotionError(e)) {
    return { isError: true, content: [{ type: 'text', text: json({ error: { code: e.code, message: e.message, ...(e.details ? { details: compact(e.details) } : {}) } }) }] }
  }
  const message = e instanceof Error ? e.message : String(e)
  return { isError: true, content: [{ type: 'text', text: json({ error: { code: 'internal', message } }) }] }
}

/** `{ ok, entity, auditId }` or `{ needsApproval, approvalId }`. */
export function writeResult(r: ExecuteResult<unknown>, drop: readonly string[] = []) {
  if (!r.ok) return { ok: false, needsApproval: true, approvalId: r.approvalId, ...(r.replayed ? { replayed: true } : {}) }
  return { ok: true, entity: compact(r.data, drop), ...(r.entity ? { ref: r.entity } : {}), auditId: r.auditId, ...(r.replayed ? { replayed: true } : {}) }
}

/** Offset-based cursor paging over an already-loaded list. */
export function paginate<T>(rows: T[], limit = 50, cursor?: string) {
  const start = cursor ? Number.parseInt(Buffer.from(cursor, 'base64url').toString(), 10) || 0 : 0
  const items = rows.slice(start, start + limit)
  const next = start + limit < rows.length ? Buffer.from(String(start + limit)).toString('base64url') : null
  return { items, nextCursor: next, total: rows.length }
}
