import 'server-only'
import { revalidatePath } from 'next/cache'
import { isMovaraError, type Ctx } from '@movara/core'
import { getCtx } from '@/lib/ctx'

export type ActionResult = { ok: true; approval?: boolean } | { ok: false; error: string }

/**
 * Shared wrapper for this area's server actions: resolves the acting Ctx, runs `fn` (usually one `execute`),
 * turns MovaraErrors into messages, flags approvals, and revalidates the given pages.
 */
export async function runAction(slug: string, paths: string[], fn: (ctx: Ctx) => Promise<unknown>): Promise<ActionResult> {
  try {
    const ctx = await getCtx(slug)
    const r = (await fn(ctx)) as { ok?: boolean; needsApproval?: boolean } | undefined
    for (const p of paths) revalidatePath(`/${slug}/${p}`)
    if (r && r.ok === false && r.needsApproval) return { ok: true, approval: true }
    return { ok: true }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    console.error('[movara] action failed', e)
    return { ok: false, error: 'Something went wrong. Try again.' }
  }
}
