import type { CaptureItemRow, MeetingNotesView, PendingCapture } from '@movara/core'

export type CaptureKind = 'todo' | 'issue' | 'headline' | 'decision'
export type PersonOpt = { id: string; name: string }

export type CaptureItemView = {
  id: string
  kind: CaptureKind
  status: 'proposed' | 'accepted' | 'rejected' | 'edited'
  title: string
  ownerRef: string | null
  ownerId: string | null
  dueDate: string | null
  description: string | null
  createdEntityId: string | null
}

export type CaptureNoteView = {
  id: string
  sourceApp: string
  sourceUrl: string | null
  title: string | null
  notesMarkdown: string
  transcript: string | null
  hasTranscript: boolean
  capturedBy: { type: 'person' | 'agent'; name: string } | null
  createdAt: string
}

export type CaptureLabels = Partial<Record<CaptureKind, string>>

export const itemView = (i: CaptureItemRow | PendingCapture): CaptureItemView => ({
  id: i.id,
  kind: i.kind,
  status: i.status,
  title: i.payload.title,
  ownerRef: i.payload.ownerRef ?? null,
  ownerId: i.payload.resolvedOwnerId ?? null,
  dueDate: i.payload.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(i.payload.dueDate) ? i.payload.dueDate : null,
  description: i.payload.description ?? null,
  createdEntityId: i.createdEntityId,
})

export const noteView = (n: MeetingNotesView, names: { people: Map<string, string>; agents: Map<string, string> }): CaptureNoteView => {
  const a = n.capturedByActor
  return {
    id: n.id,
    sourceApp: n.sourceApp,
    sourceUrl: n.sourceUrl,
    title: n.title,
    notesMarkdown: n.notesMarkdown,
    transcript: n.transcript ?? null,
    hasTranscript: n.hasTranscript,
    capturedBy: a ? { type: a.type, name: (a.type === 'agent' ? names.agents.get(a.id) : names.people.get(a.id)) ?? (a.type === 'agent' ? 'Agent' : 'Someone') } : null,
    createdAt: n.createdAt.toISOString(),
  }
}
