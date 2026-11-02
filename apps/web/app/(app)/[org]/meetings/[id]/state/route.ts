import { NextResponse } from 'next/server'
import { getLiveState, isMotionError, meetingHeartbeat } from '@motion/core'
import { loadBundle } from '@/components/meetings/bundle'
import { getCtx } from '@/lib/ctx'

export const dynamic = 'force-dynamic'

/** Polling endpoint: 204 when `sinceRev` is current, otherwise the full bundle. */
export async function GET(req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  const ctx = await getCtx(org)
  const since = new URL(req.url).searchParams.get('sinceRev')
  try {
    const live = await getLiveState(ctx, id, since !== null && since !== '' ? { sinceRev: Number(since) } : {})
    if (!live) return new NextResponse(null, { status: 204 })
    return NextResponse.json(await loadBundle(ctx, id, live), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (isMotionError(e)) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'not_found' ? 404 : 400 })
    throw e
  }
}

/** Presence ping (no rev bump). */
export async function POST(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  const ctx = await getCtx(org)
  try {
    return NextResponse.json({ ok: await meetingHeartbeat(ctx, id) })
  } catch (e) {
    if (isMotionError(e)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
