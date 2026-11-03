'use client'

import { AgentMark } from '@movara/ui/agent-mark'
import { Kbd } from '@movara/ui/kbd'
import { cn } from '@movara/ui/cn'
import { useCoach } from './coach-provider'

/** Sidebar entry that toggles the Coach panel (also ⌘J). */
export function CoachButton({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { coachName, open, toggle } = useCoach()
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.()
        toggle()
      }}
      aria-pressed={open}
      aria-keyshortcuts="Meta+J"
      data-testid="coach-toggle"
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-md px-2 text-base font-[500] text-nav outline-none transition-colors hover:bg-nav-active/60 focus-visible:ring-2 focus-visible:ring-accent',
        open && 'bg-nav-active text-ink',
        className,
      )}
    >
      <AgentMark size={16} aria-hidden />
      <span className="truncate">{coachName}</span>
      <Kbd className="ml-auto">⌘J</Kbd>
    </button>
  )
}
