/**
 * Pluggable notes -> action items extraction. Core only defines the contract; the AI engine (apps/web) registers an
 * implementation with `setNotesExtractor()` when the org has AI configured. With none registered, capture just stores the
 * notes and reports `extracted: false`.
 */

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

/** Must not throw for "nothing found" (return empty arrays). Throwing is tolerated: capture keeps the notes and reports the error. */
export type NotesExtractor = (input: NotesExtractorInput) => Promise<ExtractedItems>

let current: NotesExtractor | null = null
/** Register (or clear with null) the process-wide extractor. */
export const setNotesExtractor = (fn: NotesExtractor | null): void => {
  current = fn
}
export const getNotesExtractor = (): NotesExtractor | null => current
