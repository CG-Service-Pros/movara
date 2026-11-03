'use client'

import * as React from 'react'
import { cn } from './cn'

export interface SegmentedOption<V extends string = string> {
  value: V
  label: React.ReactNode
  icon?: React.ReactNode
}

export interface SegmentedProps<V extends string = string> extends Omit<React.ComponentProps<'div'>, 'onChange' | 'children' | 'defaultValue'> {
  options: SegmentedOption<V>[]
  value: V
  onValueChange: (value: V) => void
  /** Accessible name for the group. */
  'aria-label'?: string
}

/** Segmented control (radiogroup) for 2-4 mutually exclusive views, e.g. Chart / List. Arrow keys move selection. */
export function Segmented<V extends string = string>({ options, value, onValueChange, className, ...props }: SegmentedProps<V>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (i + dir + options.length) % options.length
    onValueChange(options[next]!.value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" className={cn('inline-flex gap-0.5 rounded-md bg-canvas p-0.5', className)} {...props}>
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-sm max-sm:h-8 font-[500] text-body outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 [&_svg]:size-[14px]',
              active && 'bg-surface text-ink shadow-[0_0_0_1px_var(--m-line),0_1px_2px_rgb(16_24_40/0.06)]',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
