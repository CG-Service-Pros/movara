export const ERROR_CODES = ['not_found', 'forbidden', 'forbidden_scope', 'conflict', 'validation', 'needs_approval'] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/** HTTP status for each error code (used by REST and MCP adapters). */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  forbidden_scope: 403,
  conflict: 409,
  validation: 422,
  needs_approval: 202,
}

/** The one error type core throws. `details` is JSON-safe extra info (e.g. the current state on a conflict). */
export class MotionError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'MotionError'
    this.code = code
    this.details = details
  }
  get status() {
    return HTTP_STATUS[this.code]
  }
  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } }
  }
}

export const isMotionError = (e: unknown): e is MotionError => e instanceof MotionError
