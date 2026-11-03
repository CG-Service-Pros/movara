'use client'

import * as React from 'react'
import { ArrowLeft, ArrowDown, ArrowUp, Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { Avatar } from '@movara/ui/avatar'
import { Button } from '@movara/ui/button'
import { Checkbox } from '@movara/ui/checkbox'
import { cn } from '@movara/ui/cn'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { Meter } from '@movara/ui/meter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Skeleton } from '@movara/ui/skeleton'
import { Textarea } from '@movara/ui/textarea'
import { ActivityFeed } from '@/components/shell/activity-feed'
import { fmtDate } from './format'
import { meterTone, PriorityGlyph, PriorityPill } from './status'
import { STATUS_ORDER, type Labels, type Option, type PriorityDetailData, type PStatus } from './types'

export type DetailApi = {
  setStatus: (s: PStatus) => void
  update: (patch: { title?: string; description?: string | null; ownerId?: string | null; teamId?: string | null; dueDate?: string | null }) => void
  toggle: (id: string, done: boolean) => void
  add: (title: string) => void
  rename: (id: string, title: string) => void
  remove: (id: string) => void
  move: (id: string, dir: -1 | 1) => void
  deletePriority: () => Promise<void>
  open: (id: string) => void
}

const NONE = 'none'
const label = 'mb-2 mt-6 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.04em] text-faint'

export function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}

export function PriorityDetail({
  d,
  labels,
  people,
  teams,
  api,
  onBack,
  quarterStart,
}: {
  d: PriorityDetailData
  labels: Labels
  people: Option[]
  teams: Option[]
  api: DetailApi
  onBack: () => void
  quarterStart: string
}) {
  const done = d.milestones.filter((m) => m.done).length
  const total = d.milestones.length
  const owner = people.find((p) => p.id === d.ownerId)
  const [confirm, setConfirm] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-5 pb-8 pt-4">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-[500] text-body outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 lg:hidden">
        <ArrowLeft size={14} strokeWidth={1.7} /> {labels.priority.plural}
      </button>

      <div className="flex items-center justify-between gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="group inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label="Change status">
            <PriorityPill status={d.status} label={labels.status[d.status]} />
            <ChevronDown size={13} strokeWidth={1.7} className="text-icon opacity-60 group-hover:opacity-100" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_ORDER.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => api.setStatus(s)}>
                <PriorityGlyph status={s} />
                <span className="flex-1">{labels.status[s]}</span>
                {d.status === s && <Check size={14} strokeWidth={2} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-sm text-body">{d.dueDate ? `Due ${fmtDate(d.dueDate, quarterStart)}` : 'No due date'}</span>
      </div>

      <EditableTitle key={`${d.id}:t:${d.title}`} value={d.title} onSave={(title) => api.update({ title })} />

      {d.parent && (
        <button type="button" onClick={() => api.open(d.parent!.id)} className="mt-1 self-start text-left text-xs text-faint hover:text-ink">
          Cascaded from <span className="underline-offset-2 hover:underline">{d.parent.title}</span>
        </button>
      )}

      <div className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-faint">Owner</span>
        <Select value={d.ownerId ?? NONE} onValueChange={(v) => api.update({ ownerId: v === NONE ? null : v })}>
          <SelectTrigger aria-label="Owner" className="h-7 border-0 bg-transparent px-1.5 shadow-none hover:bg-canvas">
            <span className="flex min-w-0 items-center gap-2">
              {owner ? <Avatar name={owner.name} size={18} /> : null}
              <SelectValue placeholder="Unassigned" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-faint">{labels.team}</span>
        <Select value={d.teamId ?? NONE} onValueChange={(v) => api.update({ teamId: v === NONE ? null : v })}>
          <SelectTrigger aria-label={labels.team} className="h-7 border-0 bg-transparent px-1.5 shadow-none hover:bg-canvas">
            <SelectValue placeholder="No team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No team</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-faint">Due</span>
        <input
          key={`${d.id}:due:${d.dueDate}`}
          type="date"
          aria-label="Due date"
          defaultValue={d.dueDate ?? ''}
          onChange={(e) => {
            if (e.target.value !== (d.dueDate ?? '')) api.update({ dueDate: e.target.value || null })
          }}
          className="h-7 w-full max-w-[160px] rounded-md bg-transparent px-1.5 text-sm text-ink outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/50 [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>

      <EditableDescription key={`${d.id}:d:${d.description ?? ''}`} value={d.description ?? ''} onSave={(description) => api.update({ description: description || null })} />

      <div className={label}>
        <span>{labels.milestone.plural}</span>
        <span className="flex items-center gap-2 text-sm font-[500] normal-case tracking-normal text-body tabular-nums">
          {total > 0 && <Meter value={done / total} tone={meterTone(d.status)} className="w-14" />}
          {done} of {total}
        </span>
      </div>
      <Milestones d={d} labels={labels} api={api} />

      {d.children.length > 0 && (
        <>
          <div className={label}>Cascaded to</div>
          <ul className="flex flex-col gap-1">
            {d.children.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => api.open(c.id)} className="w-full truncate rounded-md px-1.5 py-1 text-left text-sm text-ink hover:bg-canvas">
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={label}>Activity</div>
      <ActivityFeed items={d.activity} />

      <div className="mt-6 border-t border-line-faint pt-4">
        <Button variant="ghost" size="sm" className="text-danger-text hover:text-danger-text" onClick={() => setConfirm(true)}>
          <Trash2 size={14} strokeWidth={1.7} /> Delete {labels.priority.singular.toLowerCase()}
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {labels.priority.singular.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              “{d.title}” and its {labels.milestone.plural.toLowerCase()} will be removed. This can be restored from the recycle bin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                setDeleting(true)
                await api.deletePriority()
                setDeleting(false)
                setConfirm(false)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const fit = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  React.useLayoutEffect(fit, [fit, value])
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="Title"
      defaultValue={value}
      onInput={fit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const v = e.target.value.trim()
        if (!v) e.target.value = value
        else if (v !== value) onSave(v)
      }}
      className="-mx-1.5 mt-3 w-[calc(100%+12px)] resize-none rounded-md bg-transparent px-1.5 py-0.5 text-lg font-[620] leading-[1.3] tracking-[-0.015em] text-ink outline-none hover:bg-canvas focus:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/40"
    />
  )
}

function EditableDescription({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <Textarea
      aria-label="Description"
      rows={2}
      placeholder="Add a description"
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value.trim() !== value.trim()) onSave(e.target.value.trim())
      }}
      className="-mx-1.5 mt-3 w-[calc(100%+12px)] resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-[1.45] text-body shadow-none [field-sizing:content] hover:bg-canvas focus:bg-canvas"
    />
  )
}

function Milestones({ d, labels, api }: { d: PriorityDetailData; labels: Labels; api: DetailApi }) {
  const [editing, setEditing] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const last = d.milestones.length - 1
  return (
    <div className="flex flex-col gap-0.5">
      {d.milestones.map((m, i) => (
        <div key={m.id} className="group -mx-1.5 flex min-h-8 items-center gap-2.5 rounded-md px-1.5 hover:bg-canvas focus-within:bg-canvas">
          <Checkbox checked={m.done} onCheckedChange={(c) => api.toggle(m.id, c === true)} aria-label={`${m.done ? 'Reopen' : 'Complete'} ${m.title}`} />
          {editing === m.id ? (
            <input
              autoFocus
              defaultValue={m.title}
              aria-label={`Rename ${labels.milestone.singular.toLowerCase()}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  e.currentTarget.value = m.title
                  setEditing(null)
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.trim()
                setEditing(null)
                if (v && v !== m.title) api.rename(m.id, v)
              }}
              className="h-7 min-w-0 flex-1 rounded bg-surface px-1.5 text-sm text-ink outline-none ring-2 ring-accent/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(m.id)}
              title="Click to rename"
              className={cn('min-w-0 flex-1 truncate py-1.5 text-left text-sm outline-none', m.done ? 'text-body' : 'text-ink')}
            >
              {m.title}
            </button>
          )}
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
            <IconBtn label="Move up" disabled={i === 0} onClick={() => api.move(m.id, -1)}>
              <ArrowUp size={13} strokeWidth={1.8} />
            </IconBtn>
            <IconBtn label="Move down" disabled={i === last} onClick={() => api.move(m.id, 1)}>
              <ArrowDown size={13} strokeWidth={1.8} />
            </IconBtn>
            <IconBtn label="Delete" onClick={() => api.remove(m.id)}>
              <X size={13} strokeWidth={1.8} />
            </IconBtn>
          </span>
        </div>
      ))}
      <form
        className="-mx-1.5 mt-0.5 flex h-8 items-center gap-2.5 rounded-md px-1.5 focus-within:bg-canvas"
        onSubmit={(e) => {
          e.preventDefault()
          const v = draft.trim()
          if (!v) return
          api.add(v)
          setDraft('')
        }}
      >
        <Plus size={16} strokeWidth={1.7} className="shrink-0 text-icon" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add a ${labels.milestone.singular.toLowerCase()}`}
          aria-label={`Add a ${labels.milestone.singular.toLowerCase()}`}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </form>
    </div>
  )
}

function IconBtn({ label, children, ...props }: React.ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-6 place-items-center rounded text-icon outline-none hover:bg-nav-active hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  )
}
