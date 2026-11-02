import * as React from 'react'
import { cn } from './cn'

export interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** A lucide icon element, e.g. `<Target />`. */
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Usually a Button. */
  action?: React.ReactNode
}

/** Calm, centered placeholder for empty lists and first-run screens. */
export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 px-6 py-16 text-center', className)} {...props}>
      {icon && (
        <div className="mb-2 grid size-9 place-items-center rounded-lg bg-canvas text-icon [&_svg]:size-[18px] [&_svg]:stroke-[1.7]">{icon}</div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-base text-body">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
