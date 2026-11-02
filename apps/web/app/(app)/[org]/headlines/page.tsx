import { actingPersonId, listHeadlines } from '@motion/core'
import { Page } from '@/components/shell/page'
import { HeadlinesView } from '@/components/headlines/headlines-view'
import { peopleAndTeams } from '@/components/issues/server'
import { getMyTeams, requireModule } from '@/lib/ctx'

export default async function HeadlinesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ team?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, terms } = await requireModule(slug, 'headlines')
  const [{ people, teams }, myTeams] = await Promise.all([peopleAndTeams(ctx), getMyTeams(slug)])
  const teamId = teams.find((t) => t.id === sp.team)?.id ?? null
  const rows = await listHeadlines(ctx, { teamId: teamId ?? undefined })
  return (
    <Page title={terms.t('headline', 'plural')}>
      <HeadlinesView
        orgSlug={slug}
        headlines={rows.map((h) => ({ id: h.id, text: h.text, kind: h.kind, ownerId: h.ownerId, teamId: h.teamId, createdAt: h.createdAt.toISOString(), reviewedAt: h.reviewedAt?.toISOString() ?? null, cascaded: !!h.cascadedFromId, cascadedFromId: h.cascadedFromId, actorAgent: h.createdByActor?.type === 'agent' }))}
        people={people}
        teams={teams}
        teamId={teamId}
        defaultTeamId={myTeams[0]?.id ?? teams[0]?.id ?? ''}
        meId={actingPersonId(ctx)}
        now={new Date().toISOString()}
        labels={{ headline: terms.t('headline'), headlines: terms.t('headline', 'plural') }}
      />
    </Page>
  )
}
