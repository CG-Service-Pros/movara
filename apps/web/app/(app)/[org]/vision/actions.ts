'use server'

import { revalidatePath } from 'next/cache'
import { execute, isMovaraError, visionCreateDraft, visionDiscardDraft, visionPublish, visionUpdateDraft, type VisionSections } from '@movara/core'
import { getCtx } from '@/lib/ctx'

export type ActionResult = { ok: true; needsApproval?: boolean } | { ok: false; error: string }

async function run(slug: string, fn: (ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<ActionResult>): Promise<ActionResult> {
  const ctx = await getCtx(slug)
  try {
    return await fn(ctx)
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}

const refresh = (slug: string) => revalidatePath(`/${slug}/vision`)

/** Open a draft (a copy of the published revision, or empty). */
export async function createVisionDraft(slug: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    const r = await execute(ctx, visionCreateDraft, {})
    refresh(slug)
    return r.ok ? { ok: true } : { ok: true, needsApproval: true }
  })
}

/** Autosave: replaces one section of the draft. */
export async function saveVisionSection(slug: string, revisionId: string, key: string, value: unknown): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, visionUpdateDraft, { revisionId, sections: { [key]: value } as VisionSections })
    return { ok: true }
  })
}

export async function discardVisionDraft(slug: string, revisionId: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    await execute(ctx, visionDiscardDraft, { revisionId })
    refresh(slug)
    return { ok: true }
  })
}

export async function publishVisionDraft(slug: string, revisionId: string): Promise<ActionResult> {
  return run(slug, async (ctx) => {
    const r = await execute(ctx, visionPublish, { revisionId })
    refresh(slug)
    return r.ok ? { ok: true } : { ok: true, needsApproval: true }
  })
}
