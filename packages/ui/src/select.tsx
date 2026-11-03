'use client'

import * as React from 'react'
import * as S from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from './cn'
import { controlClasses } from './input'

/** Select root: `value` / `onValueChange`, `defaultValue`, `name`. */
export const Select = S.Root
/** Groups related SelectItems under a SelectLabel. */
export const SelectGroup = S.Group
/** Shows the selected item's text; `placeholder` when empty. */
export const SelectValue = S.Value

/** 28px button that opens the list. */
export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof S.Trigger>) {
  return (
    <S.Trigger
      className={cn(controlClasses, 'flex h-7 items-center justify-between gap-2 px-2.5 text-left max-sm:h-9 data-[placeholder]:text-faint [&>span]:truncate', className)}
      {...props}
    >
      {children}
      <S.Icon asChild>
        <ChevronDown size={14} strokeWidth={1.7} className="shrink-0 text-icon" />
      </S.Icon>
    </S.Trigger>
  )
}

/** Floating list (portaled), at least as wide as the trigger. */
export function SelectContent({ className, children, position = 'popper', sideOffset = 4, ...props }: React.ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position={position}
        sideOffset={sideOffset}
        className={cn('z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg bg-raised text-body shadow-pop', className)}
        {...props}
      >
        <S.Viewport className="p-1">{children}</S.Viewport>
      </S.Content>
    </S.Portal>
  )
}

/** Option row. `value` is required and must be non-empty. */
export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      className={cn(
        'relative flex h-7 cursor-default select-none items-center rounded-md pl-7 pr-2 text-sm max-sm:h-10 max-sm:text-[15px] font-[500] text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-nav-active',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <S.ItemIndicator>
          <Check size={14} strokeWidth={2} />
        </S.ItemIndicator>
      </span>
      <S.ItemText>{children}</S.ItemText>
    </S.Item>
  )
}

/** Group heading. */
export function SelectLabel({ className, ...props }: React.ComponentProps<typeof S.Label>) {
  return <S.Label className={cn('px-2 py-1 text-2xs font-[550] text-faint', className)} {...props} />
}

/** Hairline between groups. */
export function SelectSeparator({ className, ...props }: React.ComponentProps<typeof S.Separator>) {
  return <S.Separator className={cn('-mx-1 my-1 h-px bg-line-faint', className)} {...props} />
}
