import * as React from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'accent'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-body shadow-[inset_0_0_0_1px_var(--m-line)]',
  success: 'bg-success-soft text-success-text',
  danger: 'bg-danger-soft text-danger-text',
  warning: 'bg-warning-soft text-warning-text',
  accent: 'bg-accent-soft text-accent-text',
}

export interface BadgeProps extends React.ComponentProps<'span'> {
  /** Color meaning. Default `neutral`. */
  tone?: BadgeTone
}

/** Small 20px pill for counts and labels. Color only when it carries meaning. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-[550]', tones[tone], className)}
      {...props}
    />
  )
}
