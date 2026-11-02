import * as React from 'react'
import { cn } from './cn'

/** Pulsing placeholder block; size it with className (`h-4 w-32`). */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-well', className)} {...props} />
}
