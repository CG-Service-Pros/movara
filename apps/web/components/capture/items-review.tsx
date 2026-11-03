'use client'

import { AlertTriangle, Check, CheckCheck, ExternalLink, Gavel, ListTodo, Megaphone, Undo2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { Avatar } from '@movara/ui/avatar'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { Input } from '@movara/ui/input'
import { toast } from '@movara/ui/toaster'
import { decideCaptures, type CaptureEditInput } from '@/app/(app)/[org]/inbox/actions'
import type { CaptureItemView, CaptureKind, CaptureLabels, PersonOpt } from './types'

const KINDS: { kind: CaptureKind; fallback: string; icon: ReactNode }[] = [
  { kind: 'todo', fallback: 'To-dos', icon: <ListTodo size={14} strokeWidth={1.7} /> },
  { kind: 'issue', fallback: 'Issues', icon: <AlertTriangle size={14} strokeWidth={1.7} /> },
  { kind: 'headline', fallback: 'Headlines', icon: <Megaphone size={14} strokeWidth={1.7} /> },
  { kind: 'decision', fallback: 'Decisions', icon: <Gavel size={14} strokeWidth={1.7} /> },
]

const SINGULAR: Record<CaptureKind, string> = { todo: 'to-do', issue: 'issue', headline: 'headline', decision: 'decision' }

function entityHref(slug: string, kind: CaptureKind, id: string | null): string | null {
  if (!id) return null
  if (kind === 'todo') return `/${slug}/todos?id=${id}`
  if (kind === 'issue') return `/${slug}/issues?id=${id}`
  if (kind === 'headline') return `/${slug}/headlines`
  return null
}

type Draft = { title?: string; ownerId?: string | null; dueDate?: string | null }

/** Review controls for captured items: grouped by kind, inline edits, per-item and bulk accept / reject. */
export function ItemsReview({ slug, items, people, canDecide, labels }: { slug: string; items: CaptureItemView[]; people: PersonOpt[]; canDecide: boolean; labels?: CaptureLabels }) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [, start] = useTransition()

  const proposed = items.filter((i) => i.status === 'proposed')

  function editsFor(it: CaptureItemView): CaptureEditInput | undefined {
    const d = drafts[it.id]
    if (!d) return undefined
    const e: CaptureEditInput = {}
    if (d.title !== undefined && d.title.trim() && d.title.trim() !== it.title) e.title = d.title.trim()
    if (d.ownerId !== undefined && d.ownerId !== it.ownerId) e.ownerId = d.ownerId
    if (d.dueDate !== undefined && d.dueDate !== it.dueDate) e.dueDate = d.dueDate
    return Object.keys(e).length ? e : undefined
  }

  function decide(decision: 'accept' | 'reject', list: CaptureItemView[]) {
    if (list.length === 0) return
    const ids = list.map((i) => i.id)
    setBusy((b) => new Set([...b, ...ids]))
    start(async () => {
      const edits = decision === 'accept' ? Object.fromEntries(list.flatMap((i) => { const e = editsFor(i); return e ? [[i.id, e] as const] : [] })) : undefined
      const r = await decideCaptures(slug, { decision, itemIds: ids, edits })
      setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.delete(i)); return n })
      if (!r.ok) return void toast.error(r.error)
      const failed = r.results.filter((x) => x.error)
      if (failed.length) toast.error(failed[0]!.error!)
      else toast.success(decision === 'accept' ? (ids.length === 1 ? 'Accepted' : `Accepted ${ids.length} items`) : (ids.length === 1 ? 'Rejected' : `Rejected ${ids.length} items`))
      router.refresh()
    })
  }

  const set = (id: string, patch: Draft) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  return (
    <div className="flex flex-col gap-5" data-testid="capture-items">
      {canDecide && proposed.length > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
          <span className="text-sm text-body">{proposed.length} proposed items waiting for review</span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => decide('reject', proposed)} data-testid="reject-all"><X size={13} strokeWidth={1.8} />Reject all</Button>
            <Button size="sm" variant="primary" onClick={() => decide('accept', proposed)} data-testid="accept-all"><CheckCheck size={13} strokeWidth={1.8} />Accept all</Button>
          </span>
        </div>
      )}
      {KINDS.map(({ kind, fallback, icon }) => {
        const list = items.filter((i) => i.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind} aria-label={labels?.[kind] ?? fallback}>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-[600] uppercase tracking-wide text-faint [&_svg]:text-icon">{icon}{labels?.[kind] ?? fallback}<span className="font-[550] normal-case tracking-normal">· {list.length}</span></h3>
            <div className="divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]">
              {list.map((it) => (
                <Row key={it.id} slug={slug} it={it} people={people} canDecide={canDecide} busy={busy.has(it.id)} draft={drafts[it.id]} onDraft={(p) => set(it.id, p)}
                  onAccept={() => decide('accept', [it])} onReject={() => decide('reject', [it])} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Row({ slug, it, people, canDecide, busy, draft, onDraft, onAccept, onReject }: {
  slug: string; it: CaptureItemView; people: PersonOpt[]; canDecide: boolean; busy: boolean; draft?: Draft
  onDraft: (p: Draft) => void; onAccept: () => void; onReject: () => void
}) {
  const open = it.status === 'proposed'
  const ownerId = draft?.ownerId !== undefined ? draft.ownerId : it.ownerId
  const owner = people.find((p) => p.id === ownerId)
  const editable = open && canDecide
  const showOwner = it.kind !== 'decision'
  const href = entityHref(slug, it.kind, it.createdEntityId)
  const unresolved = open && !owner && !!it.ownerRef

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5', it.status === 'rejected' && 'opacity-60')} data-testid="capture-item" data-status={it.status}>
      <div className="min-w-[220px] flex-1">
        {editable ? (
          <Input aria-label={`${SINGULAR[it.kind]} title`} value={draft?.title ?? it.title} onChange={(e) => onDraft({ title: e.target.value })}
            className="h-7 border-transparent bg-transparent px-1.5 text-base font-[500] shadow-none hover:bg-canvas focus:bg-surface" />
        ) : (
          <div className={cn('px-1.5 text-base text-ink', it.status === 'rejected' && 'line-through')}>{it.title}</div>
        )}
        {it.description && <p className="px-1.5 text-xs text-faint">{it.description}</p>}
      </div>

      {showOwner && (
        editable ? (
          <div className="flex items-center gap-1.5">
            {owner ? <Avatar name={owner.name} size={18} /> : <span className="grid size-[18px] place-items-center rounded-full border border-dashed border-icon text-[9px] text-faint">?</span>}
            <select aria-label="Owner" value={ownerId ?? ''} onChange={(e) => onDraft({ ownerId: e.target.value || null })}
              className={cn('h-7 max-w-[210px] rounded-md bg-transparent px-1 text-sm outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/50', unresolved && !ownerId ? 'text-warning-text' : 'text-body')}>
              <option value="">{unresolved ? `Unassigned · "${it.ownerRef}"` : 'Unassigned (you)'}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : owner ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-body"><Avatar name={owner.name} size={18} />{owner.name}</span>
        ) : null
      )}

      {it.kind === 'todo' && (
        editable ? (
          <input type="date" suppressHydrationWarning aria-label="Due date" value={(draft?.dueDate !== undefined ? draft.dueDate : it.dueDate) ?? ''} onChange={(e) => onDraft({ dueDate: e.target.value || null })}
            className="h-7 rounded-md bg-transparent px-1 text-sm text-body outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/50" />
        ) : it.dueDate ? <span className="text-xs text-faint">Due {new Date(`${it.dueDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span> : null
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {open && canDecide && (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReject} aria-label={`Reject: ${it.title}`}><X size={13} strokeWidth={1.8} />Reject</Button>
            <Button size="sm" variant="primary" loading={busy} onClick={onAccept} aria-label={`Accept: ${it.title}`}><Check size={13} strokeWidth={2} />Accept</Button>
          </>
        )}
        {open && !canDecide && <Badge>Proposed</Badge>}
        {(it.status === 'accepted' || it.status === 'edited') && (
          <>
            <Badge tone="success"><Check size={11} strokeWidth={2.2} />{it.status === 'edited' ? 'Accepted (edited)' : 'Accepted'}</Badge>
            {href && <Link href={href} className="inline-flex items-center gap-1 text-xs font-[550] text-accent-text hover:underline">View {SINGULAR[it.kind]}<ExternalLink size={11} strokeWidth={1.8} /></Link>}
          </>
        )}
        {it.status === 'rejected' && <Badge><Undo2 size={11} strokeWidth={1.8} />Rejected</Badge>}
      </div>
    </div>
  )
}
