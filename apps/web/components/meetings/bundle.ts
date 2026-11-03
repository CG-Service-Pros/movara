import 'server-only'
import {
  currentQuarter, planningQuarters, quarterRange, sectionsOf, getVision, todayIn, getHeadline, getLiveState, getMeetingSeries, getMetric, getOrg, getPriority, getScorecard, getTerms, getTodo,
  listAgents, listHeadlines, listIssues, listPeople, listPriorities, listTeams, listTodos,
  type Ctx, type LiveState,
} from '@movara/core'
import { TERM_KEYS } from '@movara/terminology'
import { formatMetricValue, goalText } from './format'
import type { BHeadline, BIssue, BTodo, Bundle, PriorityPlan, Provenance, QuarterReview, SourceRef, VisionReview } from './types'

type Actored = { createdByActor?: { type: 'person' | 'agent'; id: string } | null }

/** Everything the live meeting screen renders, as plain JSON. Pass `live` to reuse an already-fetched LiveState. */
export async function loadBundle(ctx: Ctx, meetingId: string, live?: LiveState): Promise<Bundle> {
  const ls = live ?? (await getLiveState(ctx, meetingId))!
  const teamId = ls.teamId
  const [org, terms, people, agents, teams] = await Promise.all([getOrg(ctx), getTerms(ctx), listPeople(ctx), listAgents(ctx, { includeRevoked: true, includeBuiltin: true }), listTeams(ctx)])
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
      return { id: i.id, title: i.title, description: i.description, ownerId: i.ownerId, rank: i.rank, status: i.status, horizon: i.horizon, source, sourceLabel, createdBy: by(i) }
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

  // Planning sections load their own data, only while they are the current section.
  const term = ls.agenda[ls.sectionIndex]?.term
  const quarters = planningQuarters(org, todayIn(org))
  const [quarterReview, visionReview, priorityPlan] = await Promise.all([
    term === 'quarter_review' ? loadQuarterReview(ctx, org, teamId, quarters.review, todayIn(org)) : undefined,
    term === 'vision_review' || term === 'one_year_plan' ? loadVisionReview(ctx, terms) : undefined,
    term === 'priority_setting' ? loadPriorityPlan(ctx, teamId, quarters.plan) : undefined,
  ])

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
    quarterReview,
    visionReview,
    priorityPlan,
  }
}

async function scribeAgentId(ctx: Ctx, seriesId: string): Promise<string | null> {
  const s = await getMeetingSeries(ctx, seriesId).catch(() => null)
  const a = s?.scribeActor
  return a && a.type === 'agent' ? a.id : null
}

type OrgCal = Awaited<ReturnType<typeof getOrg>>
type Terms = Awaited<ReturnType<typeof getTerms>>

/** Last quarter's priorities (done / not done, per-person completion) and the scorecard trend over it. */
async function loadQuarterReview(ctx: Ctx, org: OrgCal, teamId: string, quarter: string, today: string): Promise<QuarterReview> {
  const range = quarterRange(quarter, org)
  const prios = await listPriorities(ctx, { teamId, quarter })
  const live = prios.filter((p) => p.status !== 'dropped')
  const done = live.filter((p) => p.status === 'done').length
  const owners = [...new Set(live.map((p) => p.ownerId))]
  const byPerson = owners
    .map((personId) => {
      const mine = live.filter((p) => p.ownerId === personId)
      const d = mine.filter((p) => p.status === 'done').length
      return { personId, done: d, total: mine.length, pct: Math.round((d / mine.length) * 100) }
    })
    .sort((a, b) => b.pct - a.pct || b.total - a.total)

  const view = await getScorecard(ctx, { teamId, periods: 14, asOf: today < range.end ? today : range.end }).catch(() => null)
  let scorecard: QuarterReview['scorecard'] = null
  if (view) {
    const metrics = view.metrics.map((m) => {
      const cells = m.cells.filter((c) => c.periodStart >= range.start && c.periodStart <= range.end && c.value !== null)
      const first = cells[0]?.value ?? null
      const last = cells[cells.length - 1]?.value ?? null
      return {
        id: m.id,
        title: m.title,
        ownerId: m.ownerIds[0] ?? null,
        recorded: cells.length,
        onTrack: cells.filter((c) => c.status === 'on').length,
        first: formatMetricValue(first, m),
        last: formatMetricValue(last, m),
        trend: cells.length < 2 || first === null || last === null ? null : last > first ? ('up' as const) : last < first ? ('down' as const) : ('flat' as const),
      }
    })
    const recorded = metrics.reduce((n, m) => n + m.recorded, 0)
    const on = metrics.reduce((n, m) => n + m.onTrack, 0)
    scorecard = { onTrackPct: recorded ? Math.round((on / recorded) * 100) : null, recorded, metrics }
  }
  return {
    quarter,
    priorities: prios.map((p) => ({ id: p.id, title: p.title, ownerId: p.ownerId, status: p.status })),
    done,
    notDone: live.length - done,
    dropped: prios.length - live.length,
    byPerson,
    scorecard,
  }
}

/** The published vision plan flattened into short, individually addable items. */
async function loadVisionReview(ctx: Ctx, terms: Terms): Promise<VisionReview> {
  const view = await getVision(ctx).catch(() => null)
  const sec = view?.published ? sectionsOf(view.published) : null
  const sections: VisionReview['sections'] = []
  const add = (key: string, termKey: Parameters<Terms['t']>[0], items: { label?: string; text: string }[], plural = false) => {
    const rows = items.filter((i) => i.text.trim()).map((i, n) => ({ id: `${key}.${n}`, label: i.label ?? null, text: i.text }))
    if (rows.length) sections.push({ key, label: terms.t(termKey, plural ? 'plural' : 'singular'), items: rows })
  }
  if (sec) {
    add('coreValues', 'core_values', (sec.coreValues ?? []).map((text) => ({ text })), true)
    add('coreFocus', 'core_focus', [{ label: 'Purpose', text: sec.coreFocus?.purpose ?? '' }, { label: 'Niche', text: sec.coreFocus?.niche ?? '' }])
    add('longRangeTarget', 'long_range_target', [{ text: sec.longRangeTarget?.text ? `${sec.longRangeTarget.text}${sec.longRangeTarget.date ? ` (${sec.longRangeTarget.date})` : ''}` : '' }])
    const m = sec.marketing
    add('marketing', 'marketing_strategy', [
      { label: 'Target market', text: m?.targetMarket ?? '' },
      ...(m?.uniques ?? []).map((text) => ({ label: 'Unique', text })),
      { label: 'Proven process', text: m?.provenProcess ?? '' },
      { label: 'Guarantee', text: m?.guarantee ?? '' },
    ])
    const picture = (p: NonNullable<typeof sec.threeYear> | undefined) => [
      { label: 'Date', text: p?.date ?? '' },
      { label: 'Revenue', text: p?.revenue ?? '' },
      { label: 'Profit', text: p?.profit ?? '' },
      ...(p?.measurables ?? []).map((x) => ({ label: x.name, text: x.value })),
      ...(p?.goals ?? []).map((g) => ({ label: 'Goal', text: g.text })),
    ]
    add('threeYear', 'three_year_picture', picture(sec.threeYear))
    add('oneYear', 'one_year_plan', picture(sec.oneYear))
    add('quarterly', 'quarterly_plan', [{ label: 'Quarter', text: sec.quarterly?.quarter ?? '' }, { label: 'Revenue', text: sec.quarterly?.revenue ?? '' }, { label: 'Profit', text: sec.quarterly?.profit ?? '' }])
  }
  return { hasPublished: !!view?.published, hasDraft: !!view?.draft, sections }
}

/** The priorities planned for the next quarter (this team's). */
async function loadPriorityPlan(ctx: Ctx, teamId: string, quarter: string): Promise<PriorityPlan> {
  const items = await listPriorities(ctx, { teamId, quarter })
  return { quarter, items: items.map((p) => ({ id: p.id, title: p.title, ownerId: p.ownerId, level: p.level, status: p.status })) }
}
