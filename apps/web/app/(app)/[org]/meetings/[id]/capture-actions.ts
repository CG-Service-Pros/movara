'use server'

import { revalidatePath } from 'next/cache'
import { captureMeetingNotes, isMovaraError } from '@movara/core'
import { getCtx } from '@/lib/ctx'

export type PasteNotesResult = { ok: true; proposed: number; extracted: boolean; error?: string } | { ok: false; error: string }

/** A scribe pastes notes (Granola, Plaud, anything) into the live meeting; items become reviewable proposals in the Inbox. */
export async function pasteMeetingNotes(slug: string, meetingId: string, notes: string): Promise<PasteNotesResult> {
  try {
    const ctx = await getCtx(slug)
    const r = await captureMeetingNotes(ctx, { meetingId, sourceApp: 'manual', notesMarkdown: notes.trim(), autoAccept: false })
    revalidatePath(`/${slug}/inbox`)
    revalidatePath(`/${slug}/meetings/${meetingId}`)
    return { ok: true, proposed: r.proposed, extracted: r.extracted, error: r.extractionError }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}
