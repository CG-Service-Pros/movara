import { authenticateApiKey, MotionError } from '@motion/core'
import { getDb } from '@/lib/db'
import { handlers } from './handlers'
import { errorResponse, json } from './respond'
import type { ApiHandler, ApiRequest } from './types'

type Route = { method: string; segments: string[]; handler: ApiHandler }

const routes: Route[] = Object.entries(handlers).map(([key, handler]) => {
  const [method, path] = key.split(' ') as [string, string]
  return { method, segments: path.split('/').filter(Boolean), handler }
})

function match(method: string, parts: string[]): { route: Route; params: Record<string, string> } | 'method' | null {
  let pathHit = false
  for (const route of routes) {
    if (route.segments.length !== parts.length) continue
    const params: Record<string, string> = {}
    const ok = route.segments.every((s, i) => {
      if (s.startsWith(':')) {
        params[s.slice(1)] = decodeURIComponent(parts[i]!)
        return true
      }
      return s === parts[i]
    })
    if (!ok) continue
    pathHit = true
    if (route.method === method) return { route, params }
  }
  return pathHit ? 'method' : null
}

/** Authenticate (Authorization: Bearer mk_live_…), route and run a REST request under /api/v1. */
export async function handleApi(request: Request, path: string[]): Promise<Response> {
  try {
    const auth = request.headers.get('authorization') ?? ''
    const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]
    if (!token) return json({ error: { code: 'forbidden', message: 'Missing bearer token' } }, 401, { 'WWW-Authenticate': 'Bearer' })
    const db = await getDb()
    let ctx
    try {
      ctx = await authenticateApiKey(db, token.trim())
    } catch (e) {
      if (e instanceof MotionError && e.code === 'forbidden') return json(e.toJSON(), 401, { 'WWW-Authenticate': 'Bearer' })
      throw e
    }

    const m = match(request.method, path)
    if (m === null) return json({ error: { code: 'not_found', message: 'Unknown endpoint' } }, 404)
    if (m === 'method') return json({ error: { code: 'validation', message: 'Method not allowed' } }, 405)

    const ifMatch = request.headers.get('if-match')
    const expected = ifMatch && /^"?(\d+)"?$/.exec(ifMatch)?.[1]
    const req: ApiRequest = {
      ctx,
      params: m.params,
      query: new URL(request.url).searchParams,
      requestId: request.headers.get('idempotency-key') ?? undefined,
      expectedVersion: expected ? Number(expected) : undefined,
      request,
      json: async () => {
        try {
          return await request.json()
        } catch {
          throw new MotionError('validation', 'Request body must be valid JSON')
        }
      },
    }
    const out = await m.route.handler(req)
    return out instanceof Response ? out : json({ data: out })
  } catch (e) {
    return errorResponse(e)
  }
}
