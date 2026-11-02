import { cn } from '@motion/ui/cn'
import { ActorMark, ProvenanceLine, type ProvenanceActor } from './provenance'

/** One line of an activity feed. Serializable, so server components can build it for client components. */
export type ActivityItem = {
  id: string
  /** ISO timestamp. */
  at: string
  actor: ProvenanceActor
  /** "completed", "set status to On track". */
  verb: string
  /** The thing acted on, shown in quotes after the verb. */
  subject?: string
  /** Extra provenance text such as a meeting name. */
  extra?: string
}

/** The shape of an `audit_events` row as the feed needs it (core's `AuditEventRow` satisfies it). */
export type AuditEventLike = {
  id: string
  at: Date | string
  actor: { type: 'person' | 'agent'; id: string; onBehalfOf?: string }
  onBehalfOf: string | null
  command: string
  entityType: string | null
  entityId: string | null
  diff: { before?: unknown; after?: unknown; [k: string]: unknown } | null
}

/** id -> display name, for people and agents. */
export type ActorDirectory = { people: Record<string, string>; agents: Record<string, string> }

export type DescribeContext = {
  /** Status value -> label (terminology aware): `terms.status`. */
  statusLabel?: (value: string) => string
  /** Title of an entity when the event itself doesn't carry one. */
  entityTitle?: (e: AuditEventLike) => string | undefined
  /** Terminology labels, singular, lower case friendly. */
  /** Name the entity on priority events too ("set status to On track on “Ship it”"). For feeds that span many entities. */
  includeEntity?: boolean
  words?: { priority?: string; milestone?: string; todo?: string; metric?: string; issue?: string; headline?: string }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/**
 * Turn an audit event into `{ verb, subject }`. Unknown commands fall back to a humanized command name,
 * so a feed never hides an event. Returns null for events that are noise (e.g. reorders).
 */
export function describeAuditEvent(e: AuditEventLike, c: DescribeContext = {}): { verb: string; subject?: string } | null {
  const d = describeCore(e, c)
  if (d && c.includeEntity && !d.subject && e.entityType === 'priority' && e.command !== 'priority.create') {
    const t = c.entityTitle?.(e)
    if (t) return { verb: `${d.verb} on`, subject: t }
  }
  return d
}

function describeCore(e: AuditEventLike, c: DescribeContext): { verb: string; subject?: string } | null {
  const before = obj(e.diff?.before)
  const after = obj(e.diff?.after)
  const sl = c.statusLabel ?? ((v: string) => v.replace(/_/g, ' '))
  const w = { priority: 'priority', milestone: 'milestone', todo: 'to-do', metric: 'metric', issue: 'issue', headline: 'headline', ...c.words }
  const title = str(after.title) ?? str(before.title) ?? str(e.diff?.milestoneTitle) ?? c.entityTitle?.(e)
  switch (e.command) {
    case 'priority.create':
      return c.includeEntity ? { verb: `created ${w.priority}`, subject: title } : { verb: `created this ${w.priority}` }
    case 'priority.set_status':
      if (after.status === undefined) return null // status unchanged: nothing to show
      return { verb: `set status to ${sl(String(after.status))}` }
    case 'priority.update': {
      const keys = Object.keys(after).filter((k) => before[k] !== after[k])
      const names: Record<string, string> = { title: 'title', description: 'description', ownerId: 'owner', teamId: 'team', dueDate: 'due date', level: 'level', parentPriorityId: 'parent' }
      const list = keys.map((k) => names[k] ?? k)
      return { verb: list.length ? `changed the ${list.join(', ')}` : `edited this ${w.priority}` }
    }
    case 'priority.delete':
      return { verb: `deleted this ${w.priority}` }
    case 'priority.reorder':
    case 'milestone.reorder':
      return null
    case 'milestone.add':
      return { verb: `added ${w.milestone}`, subject: title }
    case 'milestone.update':
      return after.title !== undefined ? { verb: `renamed ${w.milestone} to`, subject: str(after.title) } : { verb: `updated ${w.milestone}`, subject: title }
    case 'milestone.toggle':
      return title ? { verb: after.doneAt ? 'completed' : 'reopened', subject: title } : { verb: `${after.doneAt ? 'completed' : 'reopened'} a ${w.milestone}` }
    case 'milestone.delete':
      return { verb: `removed ${w.milestone}`, subject: title }
    case 'todo.create':
      return { verb: `added ${w.todo}`, subject: title }
    case 'todo.complete':
      return { verb: `completed ${w.todo}`, subject: title }
    case 'todo.uncomplete':
      return { verb: `reopened ${w.todo}`, subject: title }
    case 'metric.record_values':
      return { verb: `recorded ${w.metric} values` }
    default: {
      const [area, action] = e.command.split('.')
      const human = (action ?? e.command).replace(/_/g, ' ')
      return { verb: `${human} ${(area ?? '').replace(/_/g, ' ')}`.trim(), subject: title }
    }
  }
}

/** Map audit events to feed items (drops events `describe` returns null for). */
export function buildActivityItems(events: AuditEventLike[], dir: ActorDirectory, ctx: DescribeContext = {}): ActivityItem[] {
  const first = (n: string) => n.split(' ')[0] ?? n
  const out: ActivityItem[] = []
  for (const e of events) {
    const d = describeAuditEvent(e, ctx)
    if (!d) continue
    const isAgent = e.actor.type === 'agent'
    const behalf = e.onBehalfOf ?? e.actor.onBehalfOf
    out.push({
      id: e.id,
      at: typeof e.at === 'string' ? e.at : e.at.toISOString(),
      actor: {
        type: e.actor.type,
        name: isAgent ? (dir.agents[e.actor.id] ?? 'Agent') : first(dir.people[e.actor.id] ?? 'Someone'),
        onBehalfOfName: isAgent && behalf ? first(dir.people[behalf] ?? 'someone') : null,
      },
      verb: d.verb,
      subject: d.subject,
    })
  }
  return out
}

/**
 * Activity with provenance: a person avatar or agent mark, "<b>Actor</b> did X", and under it
 * "via MCP · on behalf of Oscar · 3m ago" for agents. Server- and client-safe (no hooks).
 */
export function ActivityFeed({ items, empty = 'No activity yet.', className }: { items: ActivityItem[]; empty?: string; className?: string }) {
  if (!items.length) return <p className={cn('py-2 text-sm text-faint', className)}>{empty}</p>
  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((it) => (
        <li key={it.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 pb-3 pt-2 text-sm leading-[1.35] text-ink">
          <ActorMark actor={it.actor} size={20} />
          <div className="min-w-0">
            <div className="break-words">
              <b className="font-semibold">{it.actor.name}</b> {it.verb}
              {it.subject ? <> {'“'}{it.subject}{'”'}</> : null}
            </div>
            <ProvenanceLine actor={it.actor} at={it.at} extra={it.extra} />
          </div>
        </li>
      ))}
    </ul>
  )
}
