import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from '@motion/ui/toaster'
import { CommandPalette } from './command-palette'
import type { NavSection, PaletteItem } from './nav'
import type { OrgSwitcherProps } from './org-switcher'
import { Sidebar } from './sidebar'

/**
 * The app frame (matches the motion-priorities mockup): sidebar on the canvas, content in an
 * inset white panel, the org accent applied as --accent, a toaster and the ⌘K palette.
 */
export function AppShell({ accent, sections, switcher, palette, children }: { accent?: string; sections: NavSection[]; switcher: OrgSwitcherProps; palette: PaletteItem[]; children: ReactNode }) {
  const style = accent ? ({ '--accent': accent } as CSSProperties) : undefined
  return (
    <div className="flex h-screen bg-canvas" style={style} data-shell>
      <Sidebar sections={sections} switcher={switcher} />
      <main className="mr-2 mt-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-[10px] bg-surface shadow-panel">{children}</main>
      <CommandPalette items={palette} />
      <Toaster />
    </div>
  )
}
