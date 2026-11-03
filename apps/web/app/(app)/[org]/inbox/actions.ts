'use server'

import { revalidatePath } from 'next/cache'
import { captureAcceptItems, captureRejectItems, execute, isMovaraError } from '@movara/core'
import { getCtx } from '@/lib/ctx'

export type CaptureEditInput = { title?: string; ownerId?: string | null; dueDate?: string | null }
export type DecideResult = { ok: true; results: { id: string; status: string; createdEntityId?: string | null; error?: string }[] } | { ok: false; error: string }

/** Accept (with optional per-item edits) or reject proposed capture items as the signed-in person. */
export async function decideCaptures(slug: string, input: { decision: 'accept' | 'reject'; itemIds: string[]; edits?: Record<string, CaptureEditInput> }): Promise<DecideResult> {
  try {
    const ctx = await getCtx(slug)
    if (input.itemIds.length === 0) return { ok: true, results: [] }
    let results: { id: string; status: string; createdEntityId?: string | null; error?: string }[]
    if (input.decision === 'accept') {
      const r = await execute(ctx, captureAcceptItems, { itemIds: input.itemIds, edits: input.edits })
      if (!r.ok) return { ok: false, error: 'This needs approval first.' }
      results = (r.data as { results: typeof results }).results
    } else {
      const r = await execute(ctx, captureRejectItems, { itemIds: input.itemIds })
      if (!r.ok) return { ok: false, error: 'This needs approval first.' }
      results = (r.data as { rejected: string[] }).rejected.map((id) => ({ id, status: 'rejected' }))
    }
    for (const p of ['inbox', 'meetings', 'todos', 'issues', 'headlines']) revalidatePath(`/${slug}/${p}`)
    revalidatePath(`/${slug}`, 'layout')
    return { ok: true, results }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}
