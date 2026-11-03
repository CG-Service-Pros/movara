'use client'

import { useShellFocus } from './shell-context'

import { Bot, Menu, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@movara/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@movara/ui/sheet'
import { useCoach } from '@/components/coach/coach-provider'
import { openCommandPalette } from './command-palette'
import type { NavSection } from './nav'
import type { OrgSwitcherProps } from './org-switcher'
import { SidebarNav } from './sidebar'

/** Top bar shown at <=768px: hamburger opens the nav in a left sheet. */
export function MobileNav({ sections, switcher }: { sections: NavSection[]; switcher: OrgSwitcherProps }) {
  const [open, setOpen] = useState(false)
  const coach = useCoach()
  if (useShellFocus()) return null // meeting focus mode: the meeting header's back button is the way out
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Open navigation"><Menu size={17} strokeWidth={1.7} /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] gap-0 bg-canvas p-0" hideClose>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <SidebarNav sections={sections} switcher={switcher} onNavigate={() => setOpen(false)} className="w-full pt-3" />
        </SheetContent>
      </Sheet>
      <span className="truncate text-[14px] font-[650] tracking-[-0.015em] text-ink">{switcher.wordmark}</span>
      <Button size="icon" variant="ghost" className="ml-auto" aria-label={coach.coachName} onClick={coach.toggle}><Bot size={16} strokeWidth={1.7} /></Button>
      <Button size="icon" variant="ghost" aria-label="Search" onClick={() => openCommandPalette()}><Search size={16} strokeWidth={1.7} /></Button>
    </div>
  )
}
