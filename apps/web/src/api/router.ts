import { authenticateApiKey, MovaraError } from '@movara/core'
import { getDb } from '@/lib/db'
import { handlers } from './handlers'
import { errorResponse, json } from './respond'
import type { ApiHandler, ApiRequest } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Largest accepted request body (bytes). */
export const MAX_BODY_BYTES = 1_000_000

// Per-process sliding-window limiter: one bucket per API key (and one for failed auth per client address).
const hits = new Map<string, number[]>()
export function rateLimited(bucket: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const list = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(bucket, list)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  return list.length > max
}
const RATE_PER_MIN = Number(process.env.MOVARA_API_RATE_LIMIT ?? 600)
const AUTH_FAIL_PER_MIN = 30
const clientAddress = (r: Request) => (r.headers.get('x-forwarded-for')?.split(',')[0] ?? r.headers.get('x-real-ip') ?? 'unknown').trim()

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
        try {
          params[s.slice(1)] = decodeURIComponent(parts[i]!)
        } catch {
          return false
        }
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
    if (!token) {
      if (rateLimited(`anon:${clientAddress(request)}`, AUTH_FAIL_PER_MIN)) return json({ error: { code: 'rate_limited', message: 'Too many requests' } }, 429, { 'Retry-After': '60' })
      return json({ error: { code: 'forbidden', message: 'Missing bearer token' } }, 401, { 'WWW-Authenticate': 'Bearer' })
    }
    const db = await getDb()
    let ctx
    try {
      ctx = await authenticateApiKey(db, token.trim())
    } catch (e) {
      if (e instanceof MovaraError && (e.code === 'forbidden' || e.code === 'not_found')) {
        if (rateLimited(`authfail:${clientAddress(request)}`, AUTH_FAIL_PER_MIN)) return json({ error: { code: 'rate_limited', message: 'Too many requests' } }, 429, { 'Retry-After': '60' })
        return json({ error: { code: 'forbidden', message: 'Invalid or revoked API key' } }, 401, { 'WWW-Authenticate': 'Bearer' })
      }
      throw e
    }
    if (rateLimited(`key:${ctx.actor.id}`, RATE_PER_MIN)) return json({ error: { code: 'rate_limited', message: 'Too many requests' } }, 429, { 'Retry-After': '60' })

    const m = match(request.method, path)
    if (m === null) return json({ error: { code: 'not_found', message: 'Unknown endpoint' } }, 404)
    if (m === 'method') return json({ error: { code: 'validation', message: 'Method not allowed' } }, 405)

    // Ids are uuids: anything else is a 404 rather than a database error. Same for `*Id` query filters.
    for (const v of Object.values(m.params)) if (!UUID.test(v)) return json({ error: { code: 'not_found', message: 'Not found' } }, 404)
    const q = new URL(request.url).searchParams
    for (const [k, v] of q) {
      if ((k === 'id' || k.endsWith('Id')) && v && !UUID.test(v)) return json({ error: { code: 'validation', message: `${k} must be a uuid` } }, 422)
      if (k === 'limit' && !/^\d{1,3}$/.test(v)) return json({ error: { code: 'validation', message: 'limit must be a positive integer up to 999' } }, 422)
    }
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) return json({ error: { code: 'validation', message: 'Request body too large' } }, 413)

    const idem = request.headers.get('idempotency-key')
    if (idem !== null && (idem.length < 1 || idem.length > 128)) return json({ error: { code: 'validation', message: 'Idempotency-Key must be 1-128 characters' } }, 422)

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
          const text = await request.text()
          if (text.length > MAX_BODY_BYTES) throw new MovaraError('validation', 'Request body too large')
          return JSON.parse(text)
        } catch (e) {
          if (e instanceof MovaraError) throw e
          throw new MovaraError('validation', 'Request body must be valid JSON')
        }
      },
    }
    const out = await m.route.handler(req)
    return out instanceof Response ? out : json({ data: out })
  } catch (e) {
    return errorResponse(e)
  }
}
