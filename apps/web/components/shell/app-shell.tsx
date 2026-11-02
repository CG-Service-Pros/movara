import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from '@motion/ui/toaster'
import { CommandPalette } from './command-palette'
import { MobileNav } from './mobile-nav'
import type { NavSection, PaletteItem } from './nav'
import type { OrgSwitcherProps } from './org-switcher'
import { Sidebar } from './sidebar'

/**
 * The app frame (matches the motion-priorities mockup): sidebar on the canvas, content in an
 * inset white panel, the org accent applied as --accent, a toaster and the ⌘K palette.
 * Below 768px the sidebar becomes a hamburger sheet.
 */
export function AppShell({ accent, sections, switcher, palette, children }: { accent?: string; sections: NavSection[]; switcher: OrgSwitcherProps; palette: PaletteItem[]; children: ReactNode }) {
  const style = accent ? ({ '--accent': accent } as CSSProperties) : undefined
  return (
    <div className="flex h-screen bg-canvas max-md:flex-col" style={style} data-shell>
      <Sidebar sections={sections} switcher={switcher} />
      <MobileNav sections={sections} switcher={switcher} />
      <main className="mr-2 mt-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-[10px] bg-surface shadow-panel max-md:mx-1.5 max-md:mt-0">{children}</main>
      <CommandPalette items={palette} orgSlug={switcher.orgSlug} />
      <Toaster />
    </div>
  )
}
