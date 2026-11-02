import type { Ctx, ExecuteResult } from '@motion/core'

/** What a REST handler receives. `ctx` is already authenticated (API key -> agent Ctx). */
export type ApiRequest = {
  ctx: Ctx
  /** Path params from the route pattern, e.g. { id } for "GET /priorities/:id". */
  params: Record<string, string>
  query: URLSearchParams
  /** Idempotency-Key header -> pass as `requestId` to execute(). */
  requestId?: string
  /** If-Match header (integer) -> pass as `expectedVersion` to execute(). */
  expectedVersion?: number
  /** Parsed JSON body (throws a validation MotionError on invalid JSON). */
  json(): Promise<unknown>
  request: Request
}

/** Return plain data (-> 200 { data }), a Response, or use `fromExecute(result)` for commands. */
export type ApiHandler = (req: ApiRequest) => Promise<unknown | Response>

/** Keys are "METHOD /path/:param", relative to /api/v1. Example: "GET /priorities/:id". */
export type HandlerMap = Record<string, ApiHandler>

export type { ExecuteResult }
