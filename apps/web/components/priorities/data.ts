import 'server-only'
import { getCoachProfile, getPriority, listActivity, listAgents, listPeople, type Ctx, type Terms } from '@movara/core'
import { buildActivityItems, type ActivityItem, type AuditEventLike } from '@/components/shell/activity-feed'
import type { PriorityDetailData, PLevel, PStatus } from './types'

/** People and agents of the org as id -> name maps (for provenance lines). */
export async function actorDirectory(ctx: Ctx) {
  const [people, agents, coach] = await Promise.all([listPeople(ctx), listAgents(ctx, { includeRevoked: true, includeBuiltin: true }), getCoachProfile(ctx)])
  return {
    people: Object.fromEntries(people.map((p) => [p.id, p.name])),
    // The built-in Coach shows under the name the org gave it.
    agents: Object.fromEntries(agents.map((a) => [a.id, a.kind === 'builtin_coach' ? coach.coachName : a.name])),
  }
}

/** The priority, its milestones and its activity feed (core `listActivity`: the priority's and its milestones' events). */
export async function loadPriorityDetail(ctx: Ctx, id: string, terms: Terms): Promise<PriorityDetailData> {
  const p = await getPriority(ctx, id)
  const [dir, events] = await Promise.all([actorDirectory(ctx), listActivity(ctx, { entityType: 'priority', entityId: id, includeChildren: true, limit: 25 })])
  const titles = new Map(p.milestones.map((m) => [m.id, m.title]))
  const activity: ActivityItem[] = buildActivityItems(events as AuditEventLike[], dir, {
    statusLabel: (v) => terms.status(v),
    entityTitle: (e) => (e.entityId ? titles.get(e.entityId) : undefined),
    words: { milestone: terms.t('milestone', 'singular').toLowerCase(), priority: terms.t('priority', 'singular').toLowerCase() },
  })
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status as PStatus,
    level: p.level as PLevel,
    ownerId: p.ownerId,
    teamId: p.teamId,
    dueDate: p.dueDate,
    quarter: p.quarter,
    version: p.version,
    milestones: p.milestones.map((m) => ({ id: m.id, title: m.title, done: !!m.doneAt, dueDate: m.dueDate })),
    parent: p.parent ? { id: p.parent.id, title: p.parent.title } : null,
    children: p.children.map((c) => ({ id: c.id, title: c.title, teamId: c.teamId })),
    activity,
  }
}
