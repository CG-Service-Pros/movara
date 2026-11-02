'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from './cn'
import { overlayClasses } from './dialog'

/** Side panel root (Radix Dialog). Controlled via `open` / `onOpenChange`. */
export const Sheet = SheetPrimitive.Root
/** Element that opens the sheet (use `asChild`). */
export const SheetTrigger = SheetPrimitive.Trigger
/** Element that closes the sheet (use `asChild`). */
export const SheetClose = SheetPrimitive.Close

export type SheetSide = 'right' | 'left'

/** Full-height panel docked to `side` (default right), 420px wide. */
export function SheetContent({
  className,
  children,
  side = 'right',
  hideClose,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: SheetSide; hideClose?: boolean }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClasses} />
      <SheetPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[420px] max-w-[calc(100vw-32px)] flex-col gap-4 bg-raised p-5 text-body shadow-pop outline-none',
          side === 'right' ? 'right-0 border-l border-line' : 'left-0 border-r border-line',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-md text-icon outline-none hover:bg-nav-active hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={15} strokeWidth={1.7} />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

/** Title + description stack. */
export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-6', className)} {...props} />
}

/** Sheet heading. Required for screen readers. */
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-lg font-semibold tracking-tight text-ink', className)} {...props} />
}

/** Supporting text under the title. */
export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-base text-body', className)} {...props} />
}

/** Action row pinned to the bottom of the sheet. */
export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex items-center justify-end gap-2', className)} {...props} />
}
