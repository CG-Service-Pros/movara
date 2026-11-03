import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'

export type ActorLike = { type: 'person' | 'agent'; id: string; onBehalfOf?: string }
export type NameMap = Record<string, string>

/** Person circle or agent rounded square + name (and "for <owner>" for agents). */
export function ActorChip({ actor, names, size = 20 }: { actor: ActorLike; names: NameMap; size?: number }) {
  const name = names[actor.id] ?? (actor.type === 'agent' ? 'Agent' : 'Someone')
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {actor.type === 'agent' ? <AgentMark size={size} /> : <Avatar name={name} size={size} />}
      <span className="truncate text-base font-[500] text-ink">{name}</span>
      {actor.type === 'agent' && actor.onBehalfOf && names[actor.onBehalfOf] && <span className="truncate text-sm text-faint">for {names[actor.onBehalfOf]}</span>}
    </span>
  )
}
