import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from '@movara/ui/toaster'
import { CoachPanel } from '@/components/coach/coach-panel'
import { CoachProvider, type CoachLabels } from '@/components/coach/coach-provider'
import { CommandPalette } from './command-palette'
import { MobileNav } from './mobile-nav'
import type { NavSection, PaletteItem } from './nav'
import type { OrgSwitcherProps } from './org-switcher'
import { ShellProvider } from './shell-context'
import { Sidebar } from './sidebar'

/**
 * The app frame (matches the movara-priorities mockup): sidebar on the canvas, content in an
 * inset white panel, the org accent applied as --accent, a toaster and the ⌘K palette.
 * Below 768px the sidebar becomes a hamburger sheet.
 */
export type CoachShellProps = { coachName: string; ready: boolean; canConfigure: boolean; labels: CoachLabels }

export function AppShell({ accent, sections, switcher, palette, coach, canWrite, children }: { accent?: string; sections: NavSection[]; switcher: OrgSwitcherProps; palette: PaletteItem[]; coach: CoachShellProps; canWrite: boolean; children: ReactNode }) {
  const style = accent ? ({ '--accent': accent } as CSSProperties) : undefined
  return (
    <ShellProvider canWrite={canWrite}>
    <CoachProvider org={switcher.orgSlug} {...coach}>
    <div className="flex h-screen bg-canvas max-md:flex-col" style={style} data-shell>
      <a href="#main-content" className="sr-only rounded-md bg-surface px-3 py-2 text-sm font-[550] text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">Skip to content</a>
      <Sidebar sections={sections} switcher={switcher} />
      <MobileNav sections={sections} switcher={switcher} />
      <main id="main-content" tabIndex={-1} className="mr-2 mt-2 flex min-w-0 flex-1 flex-col overflow-hidden outline-none rounded-t-[10px] bg-surface shadow-panel max-md:mx-1.5 max-md:mt-0">{children}</main>
      <CoachPanel />
      <CommandPalette items={palette} orgSlug={switcher.orgSlug} />
      <Toaster />
    </div>
    </CoachProvider>
    </ShellProvider>
  )
}
