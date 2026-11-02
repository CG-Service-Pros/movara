import 'server-only'
import {
  currentQuarter, todayIn, getHeadline, getLiveState, getMeetingSeries, getMetric, getOrg, getPriority, getScorecard, getTerms, getTodo,
  listAgents, listHeadlines, listIssues, listPeople, listPriorities, listTeams, listTodos,
  type Ctx, type LiveState,
} from '@motion/core'
import { TERM_KEYS } from '@motion/terminology'
import { formatMetricValue, goalText } from './format'
import type { BHeadline, BIssue, BTodo, Bundle, Provenance, SourceRef } from './types'

type Actored = { createdByActor?: { type: 'person' | 'agent'; id: string } | null }

/** Everything the live meeting screen renders, as plain JSON. Pass `live` to reuse an already-fetched LiveState. */
export async function loadBundle(ctx: Ctx, meetingId: string, live?: LiveState): Promise<Bundle> {
  const ls = live ?? (await getLiveState(ctx, meetingId))!
  const teamId = ls.teamId
  const [org, terms, people, agents, teams] = await Promise.all([getOrg(ctx), getTerms(ctx), listPeople(ctx), listAgents(ctx, { includeRevoked: true }), listTeams(ctx)])
  const personName = new Map(people.map((p) => [p.id, p.name]))
  const agentName = new Map(agents.map((a) => [a.id, a.name]))
  const by = (r: Actored): Provenance => {
    const a = r.createdByActor
    if (!a) return null
    return a.type === 'agent' ? { type: 'agent', name: agentName.get(a.id) ?? 'Agent' } : { type: 'person', name: personName.get(a.id) ?? 'Member' }
  }

  const [scView, prios, hls, todoRows, issueRows] = await Promise.all([
    getScorecard(ctx, { teamId }).catch(() => null),
    listPriorities(ctx, { teamId, quarter: currentQuarter(org) }),
    listHeadlines(ctx, { teamId }),
    listTodos(ctx, { teamId, status: ['open', 'pending'] }),
    listIssues(ctx, { teamId, status: 'all', limit: 200 }),
  ])

  const ids = ls.ids
  const keep = new Set([...ids.focusIssueIds, ...ids.addedIssueIds, ...ids.solvedIssueIds])
  const visibleIssues = issueRows.filter((i) => (i.status === 'open' && i.horizon === 'short') || keep.has(i.id)).sort((a, b) => a.rank - b.rank)

  // Resolve a readable origin for issues that were dropped from an item.
  const titleCache = new Map<string, Promise<string | null>>()
  const titleOf = (s: SourceRef): Promise<string | null> => {
    if (!s) return Promise.resolve(null)
    const k = `${s.type}:${s.id}`
    if (!titleCache.has(k)) {
      const p: Promise<string | null> =
        s.type === 'priority' ? getPriority(ctx, s.id).then((r) => r.title)
        : s.type === 'metric' ? getMetric(ctx, s.id).then((r) => r.title)
        : s.type === 'headline' ? getHeadline(ctx, s.id).then((r) => r.text)
        : s.type === 'todo' ? getTodo(ctx, s.id).then((r) => r.title)
        : Promise.resolve(null)
      titleCache.set(k, p.catch(() => null))
    }
    return titleCache.get(k)!
  }
  const sourceTypeLabel = (t: string) =>
    t === 'metric' ? terms.t('metric') : t === 'priority' ? terms.t('priority') : t === 'headline' ? terms.t('headline') : t === 'todo' ? terms.t('todo') : t === 'meeting' ? 'Meeting' : t
  const issues: BIssue[] = await Promise.all(
    visibleIssues.map(async (i) => {
      const source = (i.source as SourceRef) ?? null
      const title = source ? await titleOf(source) : null
      const sourceLabel = !source ? null : source.type === 'meeting' ? 'Raised in a meeting' : title ? `From ${sourceTypeLabel(source.type).toLowerCase()} · ${title}` : `From ${sourceTypeLabel(source.type).toLowerCase()}`
      return { id: i.id, title: i.title, description: i.description, ownerId: i.ownerId, rank: i.rank, status: i.status, source, sourceLabel, createdBy: by(i) }
    }),
  )

  const doneTodos = ls.newTodoIds.length ? await Promise.all(ls.newTodoIds.filter((id) => !todoRows.some((t) => t.id === id)).map((id) => getTodo(ctx, id).catch(() => null))) : []
  const todos: BTodo[] = [...todoRows, ...doneTodos.filter((t): t is NonNullable<typeof t> => !!t)].map((t) => ({
    id: t.id, title: t.title, ownerId: t.ownerId, dueDate: t.dueDate, status: t.status, source: (t.source as SourceRef) ?? null, createdBy: by(t),
  }))

  const reviewed = new Set(ls.reviewedHeadlineIds)
  const headlines: BHeadline[] = hls
    .filter((h) => !h.reviewedAt || reviewed.has(h.id))
    .map((h) => ({ id: h.id, text: h.text, kind: h.kind, ownerId: h.ownerId, reviewed: !!h.reviewedAt, createdBy: by(h) }))

  const scorecard = scView
    ? {
        period: scView.latestPeriod,
        onTrack: scView.onTrackCount,
        offTrack: scView.offTrackCount,
        missing: scView.missingCount,
        metrics: scView.metrics.map((m) => {
          const cur = m.cells[m.cells.length - 1]
          const prev = m.cells[m.cells.length - 2]
          return {
            id: m.id,
            title: m.title,
            ownerIds: m.ownerIds,
            valueLabel: formatMetricValue(cur?.value ?? null, m),
            goalLabel: goalText(m),
            previousLabel: formatMetricValue(prev?.value ?? null, m),
            status: m.latestStatus,
          }
        }),
      }
    : null

  const labels: Bundle['labels'] = {}
  for (const k of TERM_KEYS) labels[k] = { s: terms.t(k), p: terms.t(k, 'plural'), t: terms.t(k, 'short') }
  const statusLabels = Object.fromEntries(['on_track', 'off_track', 'done', 'not_done', 'dropped', 'open', 'pending', 'solved'].map((s) => [s, terms.status(s)]))

  const scribeId = (await scribeAgentId(ctx, ls.seriesId)) ?? null
  const scribePresence = scribeId ? ls.presence.find((p) => p.id === scribeId) : undefined
  const meId = ctx.actor.type === 'person' ? ctx.actor.id : null
  return {
    live: ls,
    me: meId ? { id: meId, name: personName.get(meId) ?? 'Me' } : null,
    people: people.map((p) => ({ id: p.id, name: p.name })),
    teamName: teams.find((t) => t.id === teamId)?.name ?? '',
    timezone: org.timezone,
    today: todayIn(org),
    scribe: scribeId ? { id: scribeId, name: agentName.get(scribeId) ?? 'Notes Agent', online: !!scribePresence?.online } : null,
    otherTeams: teams.filter((t) => t.id !== teamId).map((t) => ({ id: t.id, name: t.name })),
    labels,
    statusLabels,
    scorecard,
    priorities: prios.map((p) => ({ id: p.id, title: p.title, ownerId: p.ownerId, status: p.status, dueDate: p.dueDate, milestonesDone: p.milestonesDone, milestonesTotal: p.milestonesTotal })),
    headlines,
    todos,
    issues,
  }
}

async function scribeAgentId(ctx: Ctx, seriesId: string): Promise<string | null> {
  const s = await getMeetingSeries(ctx, seriesId).catch(() => null)
  const a = s?.scribeActor
  return a && a.type === 'agent' ? a.id : null
}
