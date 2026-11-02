import * as React from 'react'
import { cn } from './cn'

/** Surface container with a hairline and subtle shadow. Compose with CardHeader / CardTitle / CardBody. */
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-xl bg-surface shadow-panel', className)} {...props} />
}

/** Top row of a Card: title on the left, optional actions on the right. */
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-h-11 items-center justify-between gap-3 border-b border-line-faint px-4', className)} {...props} />
}

/** Card heading (13px / 600). */
export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-base font-semibold text-ink', className)} {...props} />
}

/** Card content area with standard padding. */
export function CardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}
