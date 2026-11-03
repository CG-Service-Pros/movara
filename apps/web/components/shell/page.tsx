import type { ReactNode } from 'react'
import { cn } from '@movara/ui/cn'
import { PageHeader, type PageHeaderProps } from '@movara/ui/page-header'

/**
 * Standard page frame inside the inset panel: a 44px header plus a scrolling body.
 *   <Page title="Priorities" meta="Q4 2026" actions={<Button>New</Button>}>…</Page>
 */
export function Page({ children, bodyClassName, ...header }: PageHeaderProps & { bodyClassName?: string }) {
  return (
    <>
      <PageHeader {...header} />
      <PageBody className={bodyClassName}>{children}</PageBody>
    </>
  )
}

/** The scrolling content area below a PageHeader. */
export function PageBody({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-auto', className)}>{children}</div>
}
