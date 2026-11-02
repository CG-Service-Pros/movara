import * as React from 'react'
import { cn } from './cn'

/** on = on track, off = off track, done = complete. */
export type Status = 'on' | 'off' | 'done'

const colors: Record<Status, string> = {
  on: 'text-success',
  off: 'text-danger',
  done: 'text-ink',
}

export interface StatusGlyphProps extends Omit<React.ComponentProps<'svg'>, 'children'> {
  status: Status
  /** Pixel size, default 14. */
  size?: number
}

/**
 * Status mark. on: ring with dot; off: gapped ring; done: filled check.
 * Shape differs per status so it never relies on color alone.
 */
export function StatusGlyph({ status, size = 14, className, ...props }: StatusGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden
      data-status={status}
      className={cn('shrink-0', colors[status], className)}
      {...props}
    >
      {status === 'done' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="M4.3 7.2 6.1 9l3.6-3.8" fill="none" stroke="var(--m-surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle
            cx="7"
            cy="7"
            r="5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray={status === 'off' ? '26 9.2' : undefined}
            transform="rotate(-60 7 7)"
          />
          {status === 'on' && <circle cx="7" cy="7" r="2.4" fill="currentColor" />}
        </>
      )}
    </svg>
  )
}
