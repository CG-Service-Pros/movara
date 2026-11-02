'use client'

import * as React from 'react'
import * as T from '@radix-ui/react-tabs'
import { cn } from './cn'

/** Tabs root: `value` / `onValueChange` or `defaultValue`. */
export const Tabs = T.Root

/** Pill-group container on a canvas-colored track (like the mockup's kp-tabs). */
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn('inline-flex gap-0.5 rounded-md bg-canvas p-0.5', className)} {...props} />
}

/** One tab; the active one is raised on a surface with a hairline. */
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-sm font-[500] text-body outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[0_0_0_1px_var(--m-line),0_1px_2px_rgb(16_24_40/0.06)]',
        className,
      )}
      {...props}
    />
  )
}

/** Panel for a tab. */
export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('outline-none', className)} {...props} />
}
