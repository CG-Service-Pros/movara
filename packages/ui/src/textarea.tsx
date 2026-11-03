import * as React from 'react'
import { cn } from './cn'
import { controlClasses } from './input'

/** Multi-line text input, same look as Input. Vertical resize only. */
export function Textarea({ className, rows = 3, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClasses, 'min-h-14 resize-y px-2.5 py-1.5 leading-snug', className)} suppressHydrationWarning {...props} />
}
