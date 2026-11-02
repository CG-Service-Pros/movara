import * as React from 'react'
import { cn } from './cn'

/** Keyboard hint, e.g. `<Kbd>⌘K</Kbd>`. */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-canvas px-1 font-sans text-2xs font-[500] text-faint shadow-[inset_0_0_0_1px_var(--m-line)]', className)}
      {...props}
    />
  )
}
