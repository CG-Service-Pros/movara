import { isMovaraError, listCoachThreads } from '@movara/core'
import { coachRequestCtx, coachStatus, json } from '@/lib/coach'

export const dynamic = 'force-dynamic'

/** GET /api/coach/threads?org=slug: the person's conversations (newest first) and whether Coach is set up. */
export async function GET(req: Request) {
  const r = await coachRequestCtx(new URL(req.url).searchParams.get('org'))
  if ('response' in r) return r.response
  try {
    const [threads, status] = await Promise.all([listCoachThreads(r.ctx, { limit: 40 }), coachStatus(r.ctx)])
    return json({ status, threads: threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt })) })
  } catch (e) {
    if (isMovaraError(e)) return json({ error: { code: e.code, message: e.message } }, e.status)
    throw e
  }
}
