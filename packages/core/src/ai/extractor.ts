/**
 * Pluggable notes -> action items extraction. Core only defines the contract; the AI engine (apps/web) registers an
 * implementation with `setNotesExtractor()` when the org has AI configured. With none registered, capture just stores the
 * notes and reports `extracted: false`.
 */

import type { Ctx } from '../ctx'

export type CaptureItemsInput = {
  todos?: { title: string; owner?: string | null; dueDate?: string | null; description?: string | null }[]
  issues?: { title: string; owner?: string | null; description?: string | null; longTerm?: boolean }[]
  headlines?: { title: string; owner?: string | null; kind?: 'customer' | 'employee' | 'general' }[]
  decisions?: { text: string }[]
}

export type NotesExtractorInput = {
  notes: string
  transcript?: string
  people: { id: string; name: string; email: string }[]
  meeting: { title: string; date: string; team: string }
}

export type ExtractedItems = Required<CaptureItemsInput>

/**
 * Must not throw for "nothing found" (return empty arrays). Return `null` when extraction is not available for this org
 * (AI not configured): capture then behaves as if no extractor were registered. Throwing is tolerated: capture keeps the
 * notes and reports the error. `ctx` is the capturing actor's context (the extractor derives what it needs from it).
 */
export type NotesExtractor = (input: NotesExtractorInput, ctx: Ctx) => Promise<ExtractedItems | null>

/** Kept on globalThis: Next bundles instrumentation and route handlers separately, so a module-level variable would not be shared. */
const slot = globalThis as typeof globalThis & { __movaraNotesExtractor?: NotesExtractor | null }

/** Register (or clear with null) the process-wide extractor. */
export const setNotesExtractor = (fn: NotesExtractor | null): void => {
  slot.__movaraNotesExtractor = fn
}
export const getNotesExtractor = (): NotesExtractor | null => slot.__movaraNotesExtractor ?? null
