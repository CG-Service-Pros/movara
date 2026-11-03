import { NextResponse } from 'next/server'
import { getLiveState, isMovaraError, meetingHeartbeat } from '@movara/core'
import { loadBundle } from '@/components/meetings/bundle'
import { getCtx } from '@/lib/ctx'

export const dynamic = 'force-dynamic'

/** Polling endpoint: 204 when `sinceRev` is current, otherwise the full bundle. */
export async function GET(req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  const ctx = await getCtx(org)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  const since = new URL(req.url).searchParams.get('sinceRev')
  try {
    const live = await getLiveState(ctx, id, since !== null && since !== '' ? { sinceRev: Number.isFinite(Number(since)) ? Number(since) : undefined } : {})
    if (!live) return new NextResponse(null, { status: 204 })
    return NextResponse.json(await loadBundle(ctx, id, live), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (isMovaraError(e)) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'not_found' ? 404 : 400 })
    throw e
  }
}

/** Presence ping (no rev bump). */
export async function POST(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  const ctx = await getCtx(org)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  try {
    return NextResponse.json({ ok: await meetingHeartbeat(ctx, id) })
  } catch (e) {
    if (isMovaraError(e)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
