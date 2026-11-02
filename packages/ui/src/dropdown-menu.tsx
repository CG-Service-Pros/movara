'use client'

import * as React from 'react'
import * as M from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from './cn'

/** Dropdown menu root. */
export const DropdownMenu = M.Root
/** Element that opens the menu (use `asChild`). */
export const DropdownMenuTrigger = M.Trigger
export const DropdownMenuGroup = M.Group
export const DropdownMenuPortal = M.Portal
/** Radio group of DropdownMenuRadioItem; `value` / `onValueChange`. */
export const DropdownMenuRadioGroup = M.RadioGroup
/** Submenu root. */
export const DropdownMenuSub = M.Sub

const itemBase =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm font-[500] text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-nav-active [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-icon'
const contentBase = 'z-50 min-w-40 overflow-hidden rounded-lg bg-raised p-1 text-body shadow-pop'

/** Floating menu panel (portaled). */
export function DropdownMenuContent({ className, sideOffset = 6, align = 'start', ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} align={align} className={cn(contentBase, className)} {...props} />
    </M.Portal>
  )
}

/** Menu row. `icon` renders a leading lucide icon; `destructive` tints it red; `shortcut` shows a hint on the right. */
export function DropdownMenuItem({
  className,
  icon,
  shortcut,
  destructive,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { icon?: React.ReactNode; shortcut?: React.ReactNode; destructive?: boolean }) {
  return (
    <M.Item className={cn(itemBase, destructive && 'text-danger-text [&_svg]:text-danger-text', className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-auto pl-4 text-2xs text-faint">{shortcut}</span>}
    </M.Item>
  )
}

/** Checkable row. */
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <Check size={14} strokeWidth={2} />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  )
}

/** Single-choice row inside DropdownMenuRadioGroup. */
export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <Circle size={6} fill="currentColor" strokeWidth={0} />
        </M.ItemIndicator>
      </span>
      {children}
    </M.RadioItem>
  )
}

/** Small uppercase group heading. */
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2 py-1 text-2xs font-[550] text-faint', className)} {...props} />
}

/** Hairline between groups. */
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-line-faint', className)} {...props} />
}

/** Row that opens a submenu. */
export function DropdownMenuSubTrigger({ className, children, icon, ...props }: React.ComponentProps<typeof M.SubTrigger> & { icon?: React.ReactNode }) {
  return (
    <M.SubTrigger className={cn(itemBase, 'data-[state=open]:bg-nav-active', className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <ChevronRight size={14} strokeWidth={1.7} className="!text-icon-faint" />
    </M.SubTrigger>
  )
}

/** Submenu panel. */
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className={cn(contentBase, className)} {...props} />
    </M.Portal>
  )
}
