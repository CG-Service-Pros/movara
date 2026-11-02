import * as React from 'react'
import { cn } from './cn'

export interface PageHeaderProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title: React.ReactNode
  /** Breadcrumb or subtitle shown next to the title (e.g. the quarter). */
  meta?: React.ReactNode
  /** Tabs / Segmented slot, shown after the title. */
  tabs?: React.ReactNode
  /** Right-aligned buttons. */
  actions?: React.ReactNode
}

/** 44px toolbar row at the top of the inset panel, with a bottom hairline. */
export function PageHeader({ title, meta, tabs, actions, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn('flex h-11 shrink-0 items-center gap-2 border-b border-line px-4', className)} {...props}>
      <h1 className="truncate text-base font-semibold text-ink">{title}</h1>
      {meta && <div className="flex items-center gap-1.5 text-base font-[500] text-body">{meta}</div>}
      {tabs && <div className="ml-3 flex items-center">{tabs}</div>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}
