import * as React from 'react'
import { cn } from './cn'

export type MeterTone = 'neutral' | 'success' | 'danger' | 'ink' | 'accent'

const fills: Record<MeterTone, string> = {
  neutral: 'bg-icon-faint',
  success: 'bg-success',
  danger: 'bg-danger',
  ink: 'bg-icon',
  accent: 'bg-accent',
}

export interface MeterProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Progress from 0 to 1 (clamped). */
  value: number
  /** Fill color. Default `neutral`. */
  tone?: MeterTone
}

/** Thin 4px progress bar. Width is set by the parent or `className` (default 44px). */
export function Meter({ value, tone = 'neutral', className, ...props }: MeterProps) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn('h-1 w-11 overflow-hidden rounded-full bg-well', className)}
      {...props}
    >
      <div className={cn('h-full rounded-full transition-[width]', fills[tone])} style={{ width: `${v * 100}%` }} />
    </div>
  )
}
