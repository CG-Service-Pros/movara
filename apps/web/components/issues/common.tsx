'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { toast } from '@motion/ui/toaster'
import { Avatar } from '@motion/ui/avatar'
import { AgentMark } from '@motion/ui/agent-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@motion/ui/popover'
import { cn } from '@motion/ui/cn'

/** Result of a server action built with `runAction`. */
export type ActionResult = { ok: true; approval?: boolean } | { ok: false; error: string }
export type PersonLite = { id: string; name: string }
export type TeamLite = { id: string; name: string }
export type SourceInfo = { type: string; id: string; title: string | null; label: string }

/** Runs a server action in a transition and toasts the outcome. */
export function useAct() {
  const [pending, start] = React.useTransition()
  const act = React.useCallback(
    (fn: () => Promise<ActionResult>, opts: { success?: string; onDone?: () => void; onError?: () => void } = {}) =>
      start(async () => {
        const r = await fn()
        if (!r.ok) {
          toast.error(r.error)
          opts.onError?.()
          return
        }
        if (r.approval) toast('Sent for approval')
        else if (opts.success) toast.success(opts.success)
        opts.onDone?.()
      }),
    [],
  )
  return { act, pending }
}

/** Days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}

export function ageLabel(from: Date | string, now: Date | string) {
  const ms = new Date(now).getTime() - new Date(from).getTime()
  const d = Math.max(0, Math.floor(ms / 86400000))
  if (d < 1) return 'today'
  if (d < 7) return `${d}d`
  if (d < 60) return `${Math.floor(d / 7)}w`
  return `${Math.floor(d / 30)}mo`
}

export function shortDate(date: string) {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function PersonChip({ person, className }: { person?: PersonLite | null; className?: string }) {
  if (!person) return <span className={cn('text-xs text-faint', className)}>Unassigned</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-body', className)}>
      <Avatar name={person.name} size={18} />
      <span className="hidden truncate sm:inline">{person.name.split(' ')[0]}</span>
    </span>
  )
}

/** "From priority · Close four enterprise pilots" chip. */
export function SourceChip({ source, className }: { source: SourceInfo | null | undefined; className?: string }) {
  if (!source) return null
  return (
    <span
      title={source.title ? `${source.label}: ${source.title}` : source.label}
      className={cn('inline-flex h-5 max-w-[240px] items-center gap-1 truncate rounded-full bg-canvas px-2 text-xs font-[500] text-body shadow-[inset_0_0_0_1px_var(--m-line)]', className)}
    >
      <span className="shrink-0 text-faint">From {source.label.toLowerCase()}</span>
      {source.title && <span className="truncate">· {source.title}</span>}
    </span>
  )
}

export function ActorMark({ agent, name }: { agent?: boolean; name: string }) {
  return agent ? <AgentMark size={16} aria-label={name} /> : <Avatar name={name} size={16} />
}

/** Multi-select people popover (checkbox rows). `single` makes it a plain picker. */
export function OwnerPicker({
  people,
  value,
  onChange,
  single,
  allowNone,
  id,
  placeholder = 'Choose owner',
}: {
  people: PersonLite[]
  value: string[]
  onChange: (ids: string[]) => void
  single?: boolean
  allowNone?: boolean
  id?: string
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)
  const chosen = people.filter((p) => value.includes(p.id))
  const toggle = (pid: string) => {
    if (single) {
      onChange([pid])
      setOpen(false)
      return
    }
    onChange(value.includes(pid) ? value.filter((v) => v !== pid) : [...value, pid])
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-7 w-full items-center gap-2 rounded-md bg-surface px-2.5 text-left text-sm font-[450] text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {chosen.length === 0 ? (
            <span className="flex-1 text-faint">{placeholder}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {chosen.slice(0, 3).map((p) => (
                <Avatar key={p.id} name={p.name} size={16} />
              ))}
              <span className="truncate">{chosen.length === 1 ? chosen[0]!.name : `${chosen.length} owners`}</span>
            </span>
          )}
          <ChevronDown size={14} strokeWidth={1.7} className="shrink-0 text-icon" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        {allowNone && (
          <button type="button" onClick={() => { onChange([]); setOpen(false) }} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-body hover:bg-nav-active">
            <span className="size-4" />
            No owner
          </button>
        )}
        {people.map((p) => {
          const on = value.includes(p.id)
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm font-[500] text-ink hover:bg-nav-active">
              <Avatar name={p.name} size={18} />
              <span className="flex-1 truncate text-left">{p.name}</span>
              {on && <Check size={14} strokeWidth={2} className="text-accent" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

export function addDaysStr(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
