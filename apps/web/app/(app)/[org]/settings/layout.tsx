import type { ReactNode } from 'react'
import { SettingsNav } from '@/components/shell/settings-nav'
import { buildSettingsNav } from '@/components/shell/nav'
import { getOrgContext } from '@/lib/ctx'

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params
  const { modules } = await getOrgContext(org)
  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col">
      <SettingsNav sections={buildSettingsNav(org, modules)} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
