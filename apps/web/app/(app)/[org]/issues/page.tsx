import { Suspense } from 'react'
import { getIssue, listIssues } from '@movara/core'
import { Page } from '@/components/shell/page'
import { IssuesView } from '@/components/issues/issues-view'
import { IssuesSkeleton } from '@/components/issues/issues-skeleton'
import { peopleAndTeams, resolveSources } from '@/components/issues/server'
import { getMyTeams, requireModule } from '@/lib/ctx'

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ team?: string; tab?: string; id?: string; issue?: string; new?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, terms } = await requireModule(slug, 'issues')
  const [{ people, teams }, myTeams] = await Promise.all([peopleAndTeams(ctx), getMyTeams(slug)])
  // Deep link: ?id=<issueId> opens that issue (switching to its team and tab).
  const target = (sp.id ?? sp.issue) ? await getIssue(ctx, (sp.id ?? sp.issue)!).catch(() => null) : null
  const teamId = target ? target.teamId : sp.team === 'all' ? null : (teams.find((t) => t.id === sp.team)?.id ?? myTeams[0]?.id ?? teams[0]?.id ?? null)
  const [open, solved] = await Promise.all([
    listIssues(ctx, { teamId: teamId ?? undefined, status: 'open' }),
    listIssues(ctx, { teamId: teamId ?? undefined, status: 'solved', limit: 30 }),
  ])
  const labelFor = (type: string) => (type === 'priority' ? terms.t('priority').toLowerCase() : type === 'metric' ? terms.t('metric').toLowerCase() : type === 'todo' ? terms.t('todo').toLowerCase() : type === 'headline' ? terms.t('headline').toLowerCase() : type === 'issue' ? terms.t('issue').toLowerCase() : undefined)
  const resolve = await resolveSources(ctx, labelFor, [...open, ...solved].map((i) => i.source))
  const sources: Record<string, ReturnType<typeof resolve>> = {}
  for (const i of [...open, ...solved]) sources[i.id] = resolve(i.source)

  const issue = (i: (typeof open)[number]) => ({
    id: i.id, title: i.title, description: i.description, ownerId: i.ownerId, teamId: i.teamId, horizon: i.horizon, rank: i.rank, status: i.status,
    createdAt: i.createdAt.toISOString(), solvedAt: i.solvedAt?.toISOString() ?? null, source: i.source ?? null, actorAgent: i.createdByActor?.type === 'agent',
  })
  return (
    <Page title={terms.t('issue', 'plural')}>
      <Suspense fallback={<IssuesSkeleton />}>
        <IssuesView
          orgSlug={slug}
          issues={open.map(issue)}
          solved={solved.map(issue)}
          sources={sources}
          people={people}
          teams={teams}
          teamId={teamId}
          initialTab={target ? (target.status === 'solved' ? 'solved' : target.horizon === 'long' ? 'long' : 'short') : sp.tab === 'long' || sp.tab === 'solved' ? sp.tab : 'short'}
          initialSelectedId={target?.id ?? null}
          openNew={sp.new === '1'}
          now={new Date().toISOString()}
          labels={{ issue: terms.t('issue'), issues: terms.t('issue', 'plural'), solve: terms.t('solve') }}
        />
      </Suspense>
    </Page>
  )
}
