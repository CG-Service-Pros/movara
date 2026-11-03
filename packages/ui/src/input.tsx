import * as React from 'react'
import { cn } from './cn'

export const controlClasses =
  'w-full rounded-md bg-surface text-sm font-[450] text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none transition-shadow placeholder:text-faint focus:shadow-[0_0_0_1px_var(--color-accent),0_0_0_3px_var(--color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:shadow-[0_0_0_1px_var(--color-danger)]'

/** 28px single-line text input. Set `aria-invalid` for the error state. */
export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  // Browser extensions / autofill (e.g. `fdprocessedid`, password managers) add attributes to form controls before React hydrates.
  return <input type={type} className={cn(controlClasses, 'h-7 px-2.5', className)} suppressHydrationWarning {...props} />
}
