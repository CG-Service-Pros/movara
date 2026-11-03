'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@movara/ui/cn'
import { NavIcon } from './icons'
import type { NavSection } from './nav'
import { Badge2 } from './sidebar'

/** Left sub-navigation of the settings area (a horizontal scroller on mobile). */
export function SettingsNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings" className="flex w-[196px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-line px-2.5 py-3 max-md:w-full max-md:shrink-0 max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:border-b max-md:border-r-0 max-md:py-2">
      {sections.map((s) => (
        <div key={s.key} className="flex flex-col gap-px max-md:flex-row max-md:gap-1">
          {s.label && <div className="flex h-[22px] items-center px-2 text-2xs font-[550] text-faint max-md:hidden">{s.label}</div>}
          {s.items.map((i) => {
            const active = pathname === i.href || pathname.startsWith(i.href + '/')
            return (
              <Link
                key={i.key}
                href={i.href}
                className={cn(
                  'flex h-7 items-center gap-[9px] whitespace-nowrap rounded-[7px] px-2 text-base max-sm:h-9 font-[500] text-nav outline-none hover:bg-nav-active/60 focus-visible:ring-2 focus-visible:ring-accent [&_svg]:text-icon',
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
