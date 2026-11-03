import { getMetric, getScorecard, listScorecards } from '@movara/core'
import { Page } from '@/components/shell/page'
import { ScorecardView } from '@/components/scorecard/scorecard-view'
import { ScorecardEmpty } from '@/components/scorecard/scorecard-empty'
import { valueProvenance } from '@/components/scorecard/provenance'
import { peopleAndTeams } from '@/components/issues/server'
import { getMyTeams, requireModule } from '@/lib/ctx'

export default async function ScorecardPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ team?: string; periods?: string; id?: string; new?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, terms } = await requireModule(slug, 'scorecard')
  const [scorecards, { people, teams }, myTeams] = await Promise.all([listScorecards(ctx), peopleAndTeams(ctx), getMyTeams(slug)])
  const title = terms.t('scorecard')

  if (scorecards.length === 0) {
    return (
      <Page title={title}>
        <ScorecardEmpty orgSlug={slug} teams={teams} defaultTeamId={myTeams[0]?.id ?? teams[0]?.id ?? ''} label={title} />
      </Page>
    )
  }
  const target = sp.id ? await getMetric(ctx, sp.id).catch(() => null) : null
  const current = scorecards.find((s) => s.id === target?.scorecardId) ?? scorecards.find((s) => s.teamId === sp.team) ?? scorecards.find((s) => myTeams.some((t) => t.id === s.teamId)) ?? scorecards[0]!
  const n = Number(sp.periods)
  const view = await getScorecard(ctx, { scorecardId: current.id, periods: Number.isInteger(n) && n >= 1 && n <= 104 ? n : undefined })
  const provenance = await valueProvenance(ctx, view.metrics)

  return (
    <Page title={title} meta={<span className="text-faint">{current.teamName}</span>}>
      <ScorecardView
        orgSlug={slug}
        scorecard={{ id: current.id, teamId: current.teamId, teamName: current.teamName, interval: view.scorecard.interval, weekStartDay: view.scorecard.weekStartDay, periodsShown: view.scorecard.periodsShown }}
        shownPeriods={view.periods.length}
        scorecards={scorecards.map((s) => ({ teamId: s.teamId, teamName: s.teamName }))}
        periods={view.periods}
        metrics={view.metrics.map((m) => ({
          id: m.id, title: m.title, description: m.description, ownerIds: m.ownerIds, comparison: m.comparison, goal: m.goal, goalUpper: m.goalUpper, unit: m.unit, scale: m.scale, decimals: m.decimals, additive: m.additive,
          cells: m.cells.map((c) => ({ periodStart: c.periodStart, value: c.value })),
        }))}
        provenance={provenance}
        people={people}
        highlightId={target?.id}
        openNew={sp.new === '1'}
        labels={{ metric: terms.t('metric'), metrics: terms.t('metric', 'plural'), scorecard: title, issue: terms.t('issue'), issues: terms.t('issue', 'plural') }}
      />
    </Page>
  )
}
