'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Kbd } from '@motion/ui/kbd'
import { cn } from '@motion/ui/cn'
import { openCommandPalette } from './command-palette'
import { NavIcon } from './icons'
import { hrefOf, type NavItem, type NavSection } from './nav'
import { OrgSwitcher, type OrgSwitcherProps } from './org-switcher'

function isActive(item: NavItem, pathname: string, team: string | null, firstTeamId: string | undefined) {
  if (item.exact) return pathname === item.href
  const hit = pathname === item.href || pathname.startsWith(item.href + '/')
  if (!hit) return false
  if (item.key === 'settings') return pathname.startsWith(item.href) && !pathname.startsWith(item.href + '/agents')
  if (item.key === 'agents') return pathname.startsWith(item.href)
  if (item.teamId) return (team ?? firstTeamId) === item.teamId
  return true
}

export function Badge2({ n }: { n: number }) {
  return (
    <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-2xs font-semibold leading-none text-white" aria-label={`${n} pending`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

/** Sidebar content: switcher, search, and the terminology-driven nav. `onNavigate` closes the mobile sheet. */
export function SidebarNav({ sections, switcher, onNavigate, className }: { sections: NavSection[]; switcher: OrgSwitcherProps; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname()
  const team = useSearchParams().get('team')
  const firstTeamId = sections.find((s) => s.key.startsWith('team:'))?.items[0]?.teamId

  return (
    <nav aria-label="Main" className={cn('flex h-full w-[204px] shrink-0 flex-col gap-[18px] overflow-y-auto px-2.5 pb-3 pt-2', className)}>
      <OrgSwitcher {...switcher} />
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          openCommandPalette()
        }}
        className="flex h-[30px] items-center gap-2 rounded-md bg-surface pl-2.5 pr-2 text-sm text-faint shadow-[0_0_0_1px_var(--m-line)] outline-none hover:text-body focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search size={13} strokeWidth={1.8} />
        <span>Search</span>
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      {sections.map((s) => (
        <div key={s.key} className="flex flex-col gap-px">
          {s.label && <div className="flex h-[22px] items-center px-2 text-2xs font-[550] text-faint">{s.label}</div>}
          {s.items.map((i) => {
            const active = isActive(i, pathname, team, firstTeamId)
            return (
              <Link
                key={i.key}
                href={hrefOf(i)}
                onClick={onNavigate}
                data-active={active || undefined}
                className={cn(
                  'flex h-7 items-center gap-[9px] rounded-[7px] px-2 text-base font-[500] text-nav outline-none transition-colors hover:bg-nav-active/60 focus-visible:ring-2 focus-visible:ring-accent',
                  '[&_svg]:shrink-0 [&_svg]:text-icon',
                  active && 'bg-nav-active text-ink [&_svg]:text-ink',
                )}
              >
                <NavIcon name={i.icon} />
                <span className="truncate">{i.label}</span>
                {!!i.badge && <Badge2 n={i.badge} />}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Desktop sidebar (hidden on mobile, where the hamburger sheet takes over). */
export function Sidebar(props: { sections: NavSection[]; switcher: OrgSwitcherProps }) {
  return <SidebarNav {...props} className="max-md:hidden" />
}
