import {
  actingPersonId,
  currentQuarter,
  isMotionError,
  isQuarterLabel,
  listPeople,
  listPriorities,
  listTeams,
  prioritiesSummary,
  quarterRange,
  shiftQuarter,
} from '@motion/core'
import { loadPriorityDetail } from '@/components/priorities/data'
import { PrioritiesView } from '@/components/priorities/priorities-view'
import type { Labels, PLevel, PStatus, PriorityItem, Tab } from '@/components/priorities/types'
import { requireModule } from '@/lib/ctx'

type SP = { q?: string; tab?: string; team?: string; id?: string }

export default async function PrioritiesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SP> }) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams])
  const { ctx, org, terms } = await requireModule(slug, 'priorities')

  const current = currentQuarter(org)
  const quarter = sp.q && isQuarterLabel(sp.q) ? sp.q : current
  const tab: Tab = sp.tab === 'team' || sp.tab === 'mine' ? sp.tab : 'company'
  const me = actingPersonId(ctx)

  const [people, teams, rows, summary] = await Promise.all([
    listPeople(ctx),
    listTeams(ctx),
    listPriorities(ctx, { quarter, ownerId: tab === 'mine' ? me : undefined, teamId: tab === 'team' && sp.team ? sp.team : undefined }),
    prioritiesSummary(ctx, { quarter }),
  ])

  const visible = tab === 'team' ? rows.filter((r) => r.teamId) : rows
  const items: PriorityItem[] = visible.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as PStatus,
    level: r.level as PLevel,
    ownerId: r.ownerId,
    teamId: r.teamId,
    dueDate: r.dueDate,
    milestonesTotal: r.milestonesTotal,
    milestonesDone: r.milestonesDone,
  }))

  let detail = null
  if (sp.id) {
    try {
      detail = await loadPriorityDetail(ctx, sp.id, terms)
    } catch (e) {
      if (!isMotionError(e)) throw e
    }
  }

  const labels: Labels = {
    priority: { singular: terms.t('priority', 'singular'), plural: terms.t('priority', 'plural') },
    milestone: { singular: terms.t('milestone', 'singular'), plural: terms.t('milestone', 'plural') },
    team: 'Team',
    status: {
      on_track: terms.status('on_track'),
      off_track: terms.status('off_track'),
      done: terms.status('done'),
      not_done: terms.status('not_done'),
      dropped: terms.status('dropped'),
    },
  }

  return (
    <PrioritiesView
      orgSlug={slug}
      quarter={quarter}
      prevQuarter={shiftQuarter(quarter, -1, org)}
      nextQuarter={shiftQuarter(quarter, 1, org)}
      currentQuarter={current}
      quarterEnd={quarterRange(quarter, org).end}
      week={summary.week}
      tab={tab}
      teamId={sp.team ?? null}
      selectedId={detail ? detail.id : null}
      items={items}
      detail={detail}
      people={people.map((p) => ({ id: p.id, name: p.name }))}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      meId={me}
      labels={labels}
    />
  )
}
