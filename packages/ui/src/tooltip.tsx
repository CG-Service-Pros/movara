'use client'

import * as React from 'react'
import * as T from '@radix-ui/react-tooltip'
import { cn } from './cn'

/** Wrap the app (or a subtree) once. Controls open delay (default 300ms). */
export function TooltipProvider({ delayDuration = 300, ...props }: React.ComponentProps<typeof T.Provider>) {
  return <T.Provider delayDuration={delayDuration} {...props} />
}
/** Tooltip root. Needs a TooltipProvider ancestor. */
export const Tooltip = T.Root
/** Element the tooltip describes (use `asChild`). */
export const TooltipTrigger = T.Trigger

/** Dark, compact bubble (portaled). */
export function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof T.Content>) {
  return (
    <T.Portal>
      <T.Content
        sideOffset={sideOffset}
        className={cn('z-50 rounded-md bg-ink px-2 py-1 text-xs font-[500] text-canvas shadow-pop', className)}
        {...props}
      />
    </T.Portal>
  )
}

/** Convenience: `<Tip label="Archive"><Button size="icon" /></Tip>`. Wraps its own provider, so it works standalone. */
export function Tip({
  label,
  children,
  side,
  align,
}: {
  label: React.ReactNode
  children: React.ReactElement
  side?: React.ComponentProps<typeof T.Content>['side']
  align?: React.ComponentProps<typeof T.Content>['align']
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
