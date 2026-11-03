import {
  currentQuarter, getOrg, getScorecard, listPriorities, listTeams, prioritiesSummary, quarterRange, weekOfQuarter,
  todayIn, type Ctx, type Terms,
} from '@movara/core'
import { compact } from './format'

/** Concepts an agent most needs the vocabulary for. */
const OVERVIEW_TERMS = [
  'vision_plan', 'accountability_chart', 'priority', 'milestone', 'scorecard', 'metric', 'issue', 'todo', 'headline',
  'weekly_meeting', 'leadership_team', 'quarterly_plan',
] as const

export const termsInUse = (terms: Terms) =>
  Object.fromEntries(OVERVIEW_TERMS.map((k) => [k, { singular: terms.t(k), plural: terms.t(k, 'plural') }]))

export async function orgOverview(ctx: Ctx, terms: Terms) {
  const org = await getOrg(ctx)
  const quarter = currentQuarter(org)
  const teams = await listTeams(ctx)
  return compact({
    org: { id: org.id, name: org.name, slug: org.slug, timezone: org.timezone },
    terms: termsInUse(terms),
    attribution: terms.attribution,
    quarter,
    today: todayIn(org),
    week: weekOfQuarter(todayIn(org), org),
    teams: teams.map((t) => ({ id: t.id, name: t.name, isLeadership: t.isLeadership, members: t.members.map((m: any) => m.name ?? m.personId ?? m.id) })),
    me: { actor: ctx.actor, role: ctx.role, scopes: ctx.scopes },
    ...(terms.pack ? { terminologyPack: { id: terms.pack.id, name: terms.pack.name, version: terms.pack.version } } : {}),
  })
}

export async function quarterView(ctx: Ctx, terms: Terms) {
  const org = await getOrg(ctx)
  const quarter = currentQuarter(org)
  const [summary, rows] = await Promise.all([prioritiesSummary(ctx, { quarter }), listPriorities(ctx, { quarter })])
  return compact({
    quarter,
    range: quarterRange(quarter, org),
    summary,
    [terms.t('priority', 'plural').toLowerCase().replace(/\W+/g, '_')]: rows.map((p) => ({
      id: p.id, title: p.title, ownerId: p.ownerId, teamId: p.teamId, status: p.status, statusLabel: terms.status(p.status),
      milestones: `${p.milestonesDone}/${p.milestonesTotal}`, version: p.version,
    })),
  })
}

export async function teamScorecard(ctx: Ctx, teamId: string) {
  return compact(await getScorecard(ctx, { teamId }))
}
