import * as React from 'react'
import { cn } from './cn'
import type { Status } from './status-glyph'

export type { Status }

const tones: Record<Status, string> = {
  on: 'bg-success-soft text-success-text',
  off: 'bg-danger-soft text-danger-text',
  done: 'bg-canvas text-body',
}
const defaultLabels: Record<Status, string> = { on: 'On track', off: 'Off track', done: 'Done' }

export interface StatusPillProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  status: Status
  /** Override the text (terminology packs). Defaults to On track / Off track / Done. */
  label?: React.ReactNode
}

/** 22px status pill with soft status color. */
export function StatusPill({ status, label, className, ...props }: StatusPillProps) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-[550]', tones[status], className)}
      {...props}
    >
      {label ?? defaultLabels[status]}
    </span>
  )
}
