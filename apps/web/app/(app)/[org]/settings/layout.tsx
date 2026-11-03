import type { ReactNode } from 'react'
import { SettingsNav } from '@/components/shell/settings-nav'
import { buildSettingsNav } from '@/components/shell/nav'
import { getOrgContext } from '@/lib/ctx'

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params
  const { modules } = await getOrgContext(org)
  const sections = buildSettingsNav(org, modules)
  const agents = sections.find((x) => x.key === 'agents')
  // Coach settings live in the Agents group, right after the connected-agents entries.
  if (agents) agents.items.splice(Math.min(2, agents.items.length), 0, { key: 'coach', label: 'Coach', href: `/${org}/settings/coach`, icon: 'agents' })
  return (
    <div className="flex min-h-0 flex-1 max-lg:flex-col">
      <SettingsNav sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
