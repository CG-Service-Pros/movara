'use server'

import { revalidatePath } from 'next/cache'
import {
  chartAddSeat,
  chartAssignPeople,
  chartCreateDraft,
  chartDeleteSeat,
  chartDiscardDraft,
  chartMoveSeat,
  chartPublish,
  chartReorderSeats,
  chartSetAssistingAgents,
  chartUpdateSeat,
  execute,
  isMotionError,
} from '@motion/core'
import { getCtx } from '@/lib/ctx'

export type ActionResult<T = undefined> = { ok: true; needsApproval?: boolean; data?: T } | { ok: false; error: string }

async function run<T>(slug: string, fn: (ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const ctx = await getCtx(slug)
  try {
    const r = await fn(ctx)
    revalidatePath(`/${slug}/chart`)
    return r
  } catch (e) {
    if (isMotionError(e)) return { ok: false, error: e.message }
    throw e
  }
}

export async function createChartDraft(slug: string, from: 'published' | 'blank' | 'template'): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, chartCreateDraft, { from })
    return { ok: true }
  })
}

export async function discardChartDraft(slug: string, revisionId: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, chartDiscardDraft, { revisionId })
    return { ok: true }
  })
}

export async function publishChartDraft(slug: string, revisionId: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    const r = await execute(ctx, chartPublish, { revisionId })
    return r.ok ? { ok: true } : { ok: true, needsApproval: true }
  })
}

export async function addChartSeat(slug: string, revisionId: string, parentSeatId: string | null, title: string): Promise<ActionResult<{ id: string }>> {
  return run(slug, async (ctx) => {
    const r = await execute(ctx, chartAddSeat, { revisionId, parentSeatId, title })
    return r.ok ? { ok: true, data: { id: (r.data as { id: string }).id } } : { ok: false, error: 'This needs approval' }
  })
}

export type SeatPatch = {
  title: string
  responsibilities: string[]
  personIds: string[]
  agentIds: string[]
  parentSeatId: string | null
  parentChanged: boolean
  linkedPriorityId: string | null
}

export async function saveChartSeat(slug: string, seatId: string, p: SeatPatch): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, chartUpdateSeat, { seatId, title: p.title, responsibilities: p.responsibilities.map((r) => r.trim()).filter(Boolean), linkedPriorityId: p.linkedPriorityId })
    await execute(ctx, chartAssignPeople, { seatId, personIds: p.personIds })
    await execute(ctx, chartSetAssistingAgents, { seatId, agentIds: p.agentIds })
    if (p.parentChanged) await execute(ctx, chartMoveSeat, { seatId, parentSeatId: p.parentSeatId })
    return { ok: true }
  })
}

export async function deleteChartSeat(slug: string, seatId: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, chartDeleteSeat, { seatId })
    return { ok: true }
  })
}

export async function reorderChartSeats(slug: string, revisionId: string, parentSeatId: string | null, seatIds: string[]): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, chartReorderSeats, { revisionId, parentSeatId, seatIds })
    return { ok: true }
  })
}
