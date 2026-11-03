import { runCoachTurn } from '@movara/coach'
import { z } from 'zod'
import { coachRequestCtx, contextSchema, json, orgFromPath, sse } from '@/lib/coach'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const body = z.object({ threadId: z.uuid().optional(), message: z.string().trim().min(1).max(8000), org: z.string().optional(), context: contextSchema })

/** POST /api/coach/chat: one user message in, an SSE stream of Coach events out. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: { code: 'validation', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } }, 400)
  const { threadId, message, context, org } = parsed.data
  const r = await coachRequestCtx(org ?? orgFromPath(context.path))
  if ('response' in r) return r.response
  const abort = new AbortController()
  return sse(runCoachTurn({ ctx: r.ctx, signal: abort.signal }, { threadId, message, context }), abort)
}
