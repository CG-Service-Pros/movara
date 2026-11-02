'use client'

import * as React from 'react'
import * as P from '@radix-ui/react-popover'
import { cn } from './cn'

/** Popover root. */
export const Popover = P.Root
/** Element that toggles the popover (use `asChild`). */
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor

/** Floating panel for small forms or pickers (portaled, 288px wide by default). */
export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 w-72 rounded-lg bg-raised p-3 text-base text-body shadow-pop outline-none', className)}
        {...props}
      />
    </P.Portal>
  )
}
