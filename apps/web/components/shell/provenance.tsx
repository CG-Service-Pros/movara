import { Avatar } from '@motion/ui/avatar'
import { AgentMark } from '@motion/ui/agent-mark'
import { cn } from '@motion/ui/cn'

/** Who did something. People are circles, agents are rounded squares with the Bot glyph. */
export type ProvenanceActor = {
  type: 'person' | 'agent'
  name: string
  /** Agents: the person they act for. */
  onBehalfOfName?: string | null
  /** Where the write came from for agents (default "MCP"). */
  via?: string
}

/** Avatar for a person, AgentMark for an agent. */
export function ActorMark({ actor, size = 20, className }: { actor: Pick<ProvenanceActor, 'type' | 'name'>; size?: number; className?: string }) {
  return actor.type === 'agent' ? (
    <AgentMark size={size} className={className} title={actor.name} />
  ) : (
    <Avatar name={actor.name} size={size} className={className} />
  )
}

/** "3m ago", "2h ago", "Yesterday", "Nov 2". Pure; pass `now` for tests. */
export function relativeTime(at: string | Date, now: Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const s = Math.round((now.getTime() - d.getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Relative time that tolerates server/client clock differences (no hydration warning). */
export function RelativeTime({ at, className }: { at: string | Date; className?: string }) {
  const iso = typeof at === 'string' ? at : at.toISOString()
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning className={className}>
      {relativeTime(iso)}
    </time>
  )
}

/** "via MCP · on behalf of Oscar · 3m ago". People only get the time (and `extra` if given). */
export function ProvenanceLine({ actor, at, extra, className }: { actor: ProvenanceActor; at: string | Date; extra?: string; className?: string }) {
  return (
    <div className={cn('mt-0.5 text-xs text-faint', className)}>
      {actor.type === 'agent' && (
        <>
          via {actor.via ?? 'MCP'}
          {actor.onBehalfOfName ? ` · on behalf of ${actor.onBehalfOfName}` : ''} ·{' '}
        </>
      )}
      {extra ? `${extra} · ` : ''}
      <RelativeTime at={at} />
    </div>
  )
}
