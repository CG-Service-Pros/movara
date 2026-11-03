import { deleteCoachThread, getCoachThread, isMovaraError } from '@movara/core'
import { threadToUi } from '@movara/coach'
import { coachRequestCtx, json } from '@/lib/coach'

export const dynamic = 'force-dynamic'

const failure = (e: unknown) => {
  if (isMovaraError(e)) return json({ error: { code: e.code, message: e.message } }, e.status)
  throw e
}

/** GET /api/coach/threads/:id?org=slug: one conversation, ready to render. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await coachRequestCtx(new URL(req.url).searchParams.get('org'))
  if ('response' in r) return r.response
  try {
    const t = await getCoachThread(r.ctx, (await params).id)
    return json({ id: t.id, title: t.title, context: t.context, messages: threadToUi(t.messages) })
  } catch (e) {
    return failure(e)
  }
}

/** DELETE /api/coach/threads/:id?org=slug */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await coachRequestCtx(new URL(req.url).searchParams.get('org'))
  if ('response' in r) return r.response
  try {
    await deleteCoachThread(r.ctx, (await params).id)
    return json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
