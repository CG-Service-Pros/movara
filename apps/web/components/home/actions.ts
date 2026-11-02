'use server'

import { revalidatePath } from 'next/cache'
import { execute, getMetric, isMotionError, metricRecordValues, metricStatus, todoComplete, todoUncomplete } from '@motion/core'
import { getCtx } from '@/lib/ctx'

export type HomeActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

function refresh(slug: string) {
  revalidatePath(`/${slug}`)
  revalidatePath(`/${slug}/todos`)
  revalidatePath(`/${slug}/scorecard`)
}

export async function setTodoDoneAction(slug: string, todoId: string, done: boolean, requestId?: string): Promise<HomeActionResult> {
  try {
    const ctx = await getCtx(slug)
    const r = await execute(ctx, done ? todoComplete : todoUncomplete, { todoId }, { requestId })
    refresh(slug)
    return r.ok ? { ok: true } : { ok: true, message: 'Sent for approval' }
  } catch (e) {
    if (isMotionError(e)) return { ok: false, error: e.message }
    throw e
  }
}

/** Record this period's value for one of my metrics. Returns whether it is on or off goal. */
export async function recordMetricAction(slug: string, metricId: string, periodStart: string, value: number, requestId?: string): Promise<HomeActionResult<{ status: string }>> {
  try {
    const ctx = await getCtx(slug)
    const r = await execute(ctx, metricRecordValues, { values: [{ metricId, periodStart, value }] }, { requestId })
    if (!r.ok) return { ok: true, message: 'Sent for approval' }
    refresh(slug)
    const m = await getMetric(ctx, metricId)
    return { ok: true, data: { status: metricStatus(m, value) } }
  } catch (e) {
    if (isMotionError(e)) return { ok: false, error: e.message }
    throw e
  }
}
