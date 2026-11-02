import * as React from 'react'
import { cn } from './cn'
import { Label } from './label'

export interface FieldProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Label text. */
  label?: React.ReactNode
  /** Id of the control, wired to the label. */
  htmlFor?: string
  /** Helper text under the control. Hidden while `error` is shown. */
  hint?: React.ReactNode
  /** Error message; replaces the hint. */
  error?: React.ReactNode
  /** The control (Input, Textarea, Select, ...). */
  children: React.ReactNode
}

/** Label + control + hint/error wrapper. Give the control the same `id` as `htmlFor`. */
export function Field({ label, htmlFor, hint, error, className, children, ...props }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label != null && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-text">{error}</p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  )
}
