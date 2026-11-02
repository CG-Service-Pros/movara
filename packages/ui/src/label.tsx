import * as React from 'react'
import { cn } from './cn'

/** Form label (12.5px / 550). Pair with a control via `htmlFor`. */
export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-[550] text-ink', className)} {...props} />
}
