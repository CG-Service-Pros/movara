import * as React from 'react'
import { cn } from './cn'

export interface SeparatorProps extends React.ComponentProps<'div'> {
  orientation?: 'horizontal' | 'vertical'
}

/** Hairline divider. Purely decorative. */
export function Separator({ orientation = 'horizontal', className, ...props }: SeparatorProps) {
  return (
    <div
      role="none"
      data-orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
}
