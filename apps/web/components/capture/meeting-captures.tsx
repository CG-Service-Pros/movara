'use client'

import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { useState } from 'react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'
import { Badge } from '@movara/ui/badge'
import { cn } from '@movara/ui/cn'
import { SourceBadge, appLabel, timeAgo } from './format'
import { ItemsReview } from './items-review'
import { Markdown } from './markdown'
import type { CaptureItemView, CaptureLabels, CaptureNoteView, PersonOpt } from './types'

/** One captured note: source badge, author, collapsible rendered notes and transcript. */
export function NoteCard({ note, defaultOpen }: { note: CaptureNoteView; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [showTranscript, setShowTranscript] = useState(false)
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]" data-testid="capture-note">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left outline-none hover:bg-canvas/60 focus-visible:bg-canvas">
        {open ? <ChevronDown size={14} strokeWidth={1.8} className="text-icon" /> : <ChevronRight size={14} strokeWidth={1.8} className="text-icon" />}
        <FileText size={14} strokeWidth={1.7} className="text-icon" />
        <span className="min-w-0 flex-1 truncate text-base font-[550] text-ink">{note.title || 'Meeting notes'}</span>
        <SourceBadge app={note.sourceApp} />
        {note.capturedBy && (
          <span className="inline-flex items-center gap-1.5 text-xs text-body">
            {note.capturedBy.type === 'agent' ? <AgentMark size={16} /> : <Avatar name={note.capturedBy.name} size={16} />}
            <span className="hidden sm:inline">{note.capturedBy.name}</span>
          </span>
        )}
        <span className="shrink-0 text-xs text-faint">{timeAgo(note.createdAt)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line-faint px-5 py-4">
          {note.notesMarkdown.trim() ? <Markdown source={note.notesMarkdown} /> : <p className="text-sm text-faint">No notes text, only action items.</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {note.sourceUrl && /^https?:\/\//.test(note.sourceUrl) && (
              <a href={note.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-[550] text-accent-text hover:underline">Open in {appLabel(note.sourceApp)}<ExternalLink size={11} strokeWidth={1.8} /></a>
            )}
            {note.hasTranscript && (
              <button type="button" onClick={() => setShowTranscript((t) => !t)} className="font-[550] text-body underline-offset-2 hover:text-ink hover:underline">
                {showTranscript ? 'Hide transcript' : 'Show transcript'}
              </button>
            )}
          </div>
          {showTranscript && note.transcript && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-xs leading-relaxed text-body">{note.transcript}</pre>}
        </div>
      )}
    </div>
  )
}

/** "Notes & action items" for one meeting: captured notes plus the proposed / decided items. */
export function MeetingCaptures({ slug, notes, items, people, canDecide, labels, className, hideTitle }: {
  slug: string; notes: CaptureNoteView[]; items: CaptureItemView[]; people: PersonOpt[]; canDecide: boolean; labels?: CaptureLabels; className?: string; hideTitle?: boolean
}) {
  if (notes.length === 0 && items.length === 0) return null
  const pending = items.filter((i) => i.status === 'proposed').length
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label="Notes and action items" data-testid="meeting-captures">
      <div className={cn('flex items-center gap-2', hideTitle && 'hidden')}>
        <h2 className="text-sm font-[600] text-ink">Notes &amp; action items</h2>
        {pending > 0 && <Badge tone="warning">{pending} to review</Badge>}
      </div>
      <div className="flex flex-col gap-2">{notes.map((n, i) => <NoteCard key={n.id} note={n} defaultOpen={i === 0 && notes.length === 1} />)}</div>
      {items.length > 0 && <ItemsReview slug={slug} items={items} people={people} canDecide={canDecide} labels={labels} />}
    </section>
  )
}
