'use client'

import { MessageSquare } from 'lucide-react'
import type { CoachMode } from '@movara/coach'
import { AgentMark } from '@movara/ui/agent-mark'
import { cn } from '@movara/ui/cn'
import { useCoach } from './coach-provider'

/** A compact "ask Coach" row: one click opens the panel with a ready-made prompt. */
export function CoachStrip({ label, prompt, mode = 'chat', className }: { label: string; prompt?: string; mode?: CoachMode; className?: string }) {
  const { coachName, openCoach } = useCoach()
  return (
    <div className={cn('flex h-9 items-center gap-2.5 rounded-lg bg-canvas px-2.5', className)} data-testid="coach-strip">
      <AgentMark size={18} aria-hidden />
      <span className="text-sm font-[600] text-ink">{coachName}</span>
      <button
        type="button"
        onClick={() => openCoach({ prompt: prompt ?? label, mode, fresh: true })}
        className="ml-1 inline-flex h-6 items-center gap-1.5 rounded-md bg-surface px-2.5 text-xs font-[600] text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none hover:bg-nav-active focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MessageSquare size={12} strokeWidth={1.8} />
        {label}
      </button>
    </div>
  )
}
