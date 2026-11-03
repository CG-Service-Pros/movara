import { StatusGlyph } from '@movara/ui/status-glyph'
import { StatusPill } from '@movara/ui/status-pill'
import { cn } from '@movara/ui/cn'
import type { PStatus } from './types'

/** Map a priority status to the design-system status shape. Not done and dropped get distinct marks. */
export function PriorityGlyph({ status, size = 14, className }: { status: PStatus; size?: number; className?: string }) {
  if (status === 'dropped') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className={cn('shrink-0 text-icon-faint', className)}>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 2.4" />
        <path d="M4.8 7h4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'not_done') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className={cn('shrink-0 text-danger', className)}>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return <StatusGlyph status={status === 'on_track' ? 'on' : status === 'off_track' ? 'off' : 'done'} size={size} className={className} />
}

export function PriorityPill({ status, label, className }: { status: PStatus; label: string; className?: string }) {
  if (status === 'dropped') {
    return <span className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-canvas px-2 text-xs font-[550] text-faint', className)}>{label}</span>
  }
  if (status === 'not_done') {
    return <span className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-danger-soft px-2 text-xs font-[550] text-danger-text', className)}>{label}</span>
  }
  return <StatusPill status={status === 'on_track' ? 'on' : status === 'off_track' ? 'off' : 'done'} label={label} className={className} />
}

export const meterTone = (s: PStatus) => (s === 'off_track' || s === 'not_done' ? 'danger' : s === 'done' ? 'ink' : s === 'dropped' ? 'neutral' : 'success') as 'danger' | 'ink' | 'neutral' | 'success'
