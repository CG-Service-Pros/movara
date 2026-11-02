'use client'

import * as React from 'react'
import { Command as C } from 'cmdk'
import { Search } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from './cn'
import { Dialog } from './dialog'

/** cmdk command surface (filtering, arrow-key navigation). Use inside CommandDialog or inline. */
export function Command({ className, ...props }: React.ComponentProps<typeof C>) {
  return <C className={cn('flex w-full flex-col overflow-hidden rounded-xl bg-raised text-body', className)} {...props} />
}

/** ⌘K palette: a Dialog wrapping Command. Controlled via `open` / `onOpenChange`. */
export function CommandDialog({ children, ...props }: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 rounded-xl bg-raised shadow-pop outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
          <Command>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}

/** Search field at the top of the palette. */
export function CommandInput({ className, ...props }: React.ComponentProps<typeof C.Input>) {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-line-faint px-3.5">
      <Search size={15} strokeWidth={1.7} className="shrink-0 text-icon" />
      <C.Input className={cn('h-full flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint', className)} {...props} />
    </div>
  )
}

/** Scrollable result list. */
export function CommandList({ className, ...props }: React.ComponentProps<typeof C.List>) {
  return <C.List className={cn('max-h-80 overflow-y-auto p-1.5', className)} {...props} />
}

/** Shown when nothing matches. */
export function CommandEmpty({ className, ...props }: React.ComponentProps<typeof C.Empty>) {
  return <C.Empty className={cn('py-8 text-center text-base text-faint', className)} {...props} />
}

/** Titled group; pass `heading`. */
export function CommandGroup({ className, ...props }: React.ComponentProps<typeof C.Group>) {
  return (
    <C.Group
      className={cn('[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-[550] [&_[cmdk-group-heading]]:text-faint', className)}
      {...props}
    />
  )
}

/** Result row; `onSelect` fires on Enter/click. Put a lucide icon first for the leading icon. */
export function CommandItem({ className, ...props }: React.ComponentProps<typeof C.Item>) {
  return (
    <C.Item
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2 text-base font-[500] text-ink outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-nav-active [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-icon',
        className,
      )}
      {...props}
    />
  )
}

/** Hairline between groups. */
export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof C.Separator>) {
  return <C.Separator className={cn('-mx-1.5 my-1.5 h-px bg-line-faint', className)} {...props} />
}

/** Right-aligned shortcut hint inside a CommandItem. */
export function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('ml-auto text-2xs text-faint', className)} {...props} />
}
