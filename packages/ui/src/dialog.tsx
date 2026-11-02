'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from './cn'

/** Modal dialog root. Compose with DialogTrigger + DialogContent. Controlled via `open` / `onOpenChange`. */
export const Dialog = DialogPrimitive.Root
/** Element that opens the dialog (use `asChild`). */
export const DialogTrigger = DialogPrimitive.Trigger
/** Element that closes the dialog (use `asChild`). */
export const DialogClose = DialogPrimitive.Close

export const overlayClasses =
  'fixed inset-0 z-50 bg-ink/30 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0'

/** Centered panel with overlay and a close button. Needs a DialogTitle for accessibility. */
export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-raised p-5 text-body shadow-pop outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-md text-icon outline-none hover:bg-nav-active hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={15} strokeWidth={1.7} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** Title + description stack at the top of a dialog. */
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-6', className)} {...props} />
}

/** Dialog heading (17px). Required for screen readers. */
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold tracking-tight text-ink', className)} {...props} />
}

/** Supporting text under the title. */
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-base text-body', className)} {...props} />
}

/** Right-aligned action row. */
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-end gap-2', className)} {...props} />
}
