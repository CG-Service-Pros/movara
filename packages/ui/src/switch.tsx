'use client'

import * as React from 'react'
import * as S from '@radix-ui/react-switch'
import { cn } from './cn'

/** On/off toggle. Use `checked` / `onCheckedChange` (or `defaultChecked`). Label it with Label `htmlFor` + `id`. */
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-icon-faint outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[16px]" />
    </S.Root>
  )
}
