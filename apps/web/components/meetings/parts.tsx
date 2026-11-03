'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'
import { cn } from '@movara/ui/cn'
import type { MeetingOp } from '@/app/(app)/[org]/meetings/[id]/actions'
import type { ActionResult, Bundle, Provenance } from './types'

export type Act = (op: MeetingOp, patch?: (b: Bundle) => Bundle) => Promise<ActionResult>

export const nameOf = (b: Bundle, id: string | null | undefined) => (id ? (b.people.find((p) => p.id === id)?.name ?? 'Unknown') : null)

/** Person chip: circle avatar + name. */
export function Owner({ b, id, size = 18, muted }: { b: Bundle; id: string | null | undefined; size?: number; muted?: boolean }) {
  const name = nameOf(b, id)
  if (!name) return <span className="text-xs text-faint">Unassigned</span>
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm', muted ? 'text-faint' : 'text-body')}>
      <Avatar name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** "Captured by Notes Agent" line, only for agent-written items. */
export function Captured({ by, verb = 'Captured' }: { by: Provenance; verb?: string }) {
  if (!by || by.type !== 'agent') return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-[550] text-body">
      <AgentMark size={14} />
      {verb} by {by.name}
    </span>
  )
}

/** Round check used for done states. */
export function Tick({ on, size = 16 }: { on: boolean; size?: number }) {
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full', on ? 'bg-success text-white' : 'text-transparent shadow-[inset_0_0_0_1.5px_var(--m-icon-faint)]')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Check size={Math.round(size * 0.68)} strokeWidth={2.6} />
    </span>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[18px] font-[640] tracking-[-0.02em] text-ink">{children}</h2>
      {aside}
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-body">{children}</p>
}

/** A bordered list container with hairline dividers. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-4 divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]', className)}>{children}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-body">{children}</div>
}
