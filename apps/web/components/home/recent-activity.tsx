import { listAudit, listPriorities, listTodos, type Ctx, type Terms } from '@motion/core'
import { ActivityFeed, buildActivityItems, type AuditEventLike } from '@/components/shell/activity-feed'
import { actorDirectory } from '@/components/priorities/data'
import { Muted, Section } from './section'

const AREAS = ['priority.', 'milestone.', 'todo.', 'metric.', 'issue.', 'headline.']

/** Latest changes across the org, with agent provenance. Streamed inside <Suspense>. */
export async function RecentActivity({ ctx, terms }: { ctx: Ctx; terms: Terms }) {
  const [audit, dir, ps, ts] = await Promise.all([
    listAudit(ctx, { limit: 40 }),
    actorDirectory(ctx),
    listPriorities(ctx),
    listTodos(ctx, { limit: 200 }),
  ])
  const titles = new Map<string, string>([...ps.map((p) => [p.id, p.title] as const), ...ts.map((t) => [t.id, t.title] as const)])
  const events = audit.items.filter((e) => AREAS.some((a) => e.command.startsWith(a)))
  const items = buildActivityItems(events as AuditEventLike[], dir, {
    includeEntity: true,
    statusLabel: (v) => terms.status(v),
    entityTitle: (e) => (e.entityId ? titles.get(e.entityId) : undefined),
    words: { priority: terms.t('priority', 'singular').toLowerCase(), milestone: terms.t('milestone', 'singular').toLowerCase(), todo: terms.t('todo', 'singular').toLowerCase() },
  }).slice(0, 8)
  return (
    <Section title="Recent activity">
      {items.length ? <ActivityFeed items={items} /> : <Muted>Changes from you, your team and your agents show up here.</Muted>}
    </Section>
  )
}
