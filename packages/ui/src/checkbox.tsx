'use client'

import * as React from 'react'
import * as C from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from './cn'

/** 16px round checkbox (milestones, to-dos). `checked` / `onCheckedChange`; supports `"indeterminate"`. */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface text-white shadow-[inset_0_0_0_1.5px_var(--m-icon-faint)] outline-none transition-colors hover:shadow-[inset_0_0_0_1.5px_var(--m-icon)] focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-success data-[state=checked]:shadow-none data-[state=indeterminate]:bg-icon data-[state=indeterminate]:shadow-none',
        className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === 'indeterminate' ? <Minus size={11} strokeWidth={2.4} /> : <Check size={11} strokeWidth={2.6} />}
      </C.Indicator>
    </C.Root>
  )
}
