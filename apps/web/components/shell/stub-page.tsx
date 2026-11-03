import type { ReactNode } from 'react'
import { EmptyState } from '@movara/ui/empty-state'
import { NavIcon } from './icons'
import type { IconKey } from './nav'
import { Page } from './page'

/** Placeholder page: header + empty state. Feature agents replace the page that uses this. */
export function StubPage({ title, icon, description, meta, actions }: { title: string; icon: IconKey; description?: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <Page title={title} meta={meta} actions={actions}>
      <EmptyState icon={<NavIcon name={icon} size={18} />} title={`No ${title.toLowerCase()} yet`} description={description ?? 'This area is being built.'} />
    </Page>
  )
}
