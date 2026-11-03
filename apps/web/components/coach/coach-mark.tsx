import { AgentMark } from '@movara/ui/agent-mark'

/** Coach is an agent: a rounded square with the Bot glyph, plus its name. */
export function CoachMark({ name, size = 22, showName }: { name: string; size?: number; showName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <AgentMark size={size} aria-label={name} />
      {showName && <span className="text-sm font-[620] text-ink">{name}</span>}
    </span>
  )
}
