import 'server-only'
import { ctxForUser, getCoachProfile, isMovaraError, type Ctx } from '@movara/core'
import { isMockMode, type CoachContext, type CoachEvent } from '@movara/coach'
import { z } from 'zod'
import { getDb } from './db'
import { getSession } from './session'

export const contextSchema = z.object({
  path: z.string().min(1).max(500),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(80).optional(),
  mode: z.enum(['chat', 'meeting', 'vision', 'planning']).optional(),
  note: z.string().max(2000).optional(),
})

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** The org slug is the first segment of the page path (/{org}/...), or an explicit `org`. */
export function orgFromPath(path: string | undefined | null): string | null {
  const seg = (path ?? '').split('?')[0]!.split('/').filter(Boolean)[0]
  return seg && /^[a-z0-9][a-z0-9-]*$/i.test(seg) ? seg : null
}

/** Session -> Ctx for the org, as a Response-friendly result (API routes answer 401/403 instead of redirecting). */
export async function coachRequestCtx(orgSlug: string | null): Promise<{ ctx: Ctx } | { response: Response }> {
  const session = await getSession()
  if (!session) return { response: json({ error: { code: 'unauthorized', message: 'Sign in first' } }, 401) }
  if (!orgSlug) return { response: json({ error: { code: 'validation', message: 'Missing organization' } }, 400) }
  const ctx = await ctxForUser(await getDb(), { slug: orgSlug }, session.user.id)
  if (!ctx) return { response: json({ error: { code: 'forbidden', message: 'You are not a member of this organization' } }, 403) }
  return { ctx }
}

/** Coach availability for the UI: ready when configured (or in mock mode). */
export async function coachStatus(ctx: Ctx) {
  const p = await getCoachProfile(ctx)
  return { ready: p.ready || isMockMode(), enabled: p.enabled, coachName: p.coachName }
}

/** Server-sent events: one `data: {json}` frame per CoachEvent. */
export function sse(events: AsyncGenerator<CoachEvent>, abort: AbortController): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of events) controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
      } catch (e) {
        const message = isMovaraError(e) ? e.message : 'Something went wrong'
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', code: 'error', message })}\n\n`))
      } finally {
        controller.close()
      }
    },
    cancel() {
      abort.abort()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}

export type { CoachContext }
