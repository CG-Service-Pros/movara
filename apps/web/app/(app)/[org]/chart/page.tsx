import Link from 'next/link'
import { currentQuarter, getChart, hasRole, listAgents, listApprovals, listPeople, listPriorities, type SeatNode } from '@motion/core'
import { Button } from '@motion/ui/button'
import { EmptyState } from '@motion/ui/empty-state'
import { Network } from 'lucide-react'
import { Page } from '@/components/shell/page'
import { ChartWorkspace, StartChart } from '@/components/chart/chart-workspace'
import type { SeatDTO } from '@/components/chart/types'
import { fmtShortDate } from '@/components/vision/shared'
import { ProposalsBanner } from '@/components/vision/proposals-banner'
import { requireModule } from '@/lib/ctx'

/** Depth-first flatten, keeping sibling order. */
function flatten(nodes: SeatNode[], out: SeatDTO[] = []): SeatDTO[] {
  for (const n of nodes) {
    out.push({
      id: n.id,
      title: n.title,
      parentSeatId: n.parentSeatId,
      responsibilities: n.responsibilities,
      people: n.people,
      agents: n.assistingAgents,
      linkedPriorityId: n.linkedPriorityId,
    })
    flatten(n.children, out)
  }
  return out
}

export default async function ChartPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, org, terms } = await requireModule(slug, 'chart')
  const title = terms.t('accountability_chart', 'short')
  const seatLabel = terms.t('seat', 'singular')

  const [chart, pending] = await Promise.all([getChart(ctx), listApprovals(ctx, { status: 'pending', limit: 200 })])
  const pendingCount = pending.items.filter((a) => a.action.startsWith('chart.')).length
  const canEdit = hasRole(ctx, 'member')
  const editing = !!sp.edit && !!chart.draft && canEdit
  const rev = editing ? chart.draft : chart.published

  if (!rev) {
    return (
      <Page title={title} meta={chart.draft ? undefined : undefined}>
        <ProposalsBanner count={pendingCount} org={slug} />
        {chart.draft ? (
          <EmptyState
            icon={<Network />}
            title="Nothing is published yet"
            description="A draft is in progress. Publish it to make it the company's chart."
            action={
              <Button variant="primary" asChild>
                <Link href={`/${slug}/chart?edit=1`}>Continue draft</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Network />}
            title={`Start your ${title.toLowerCase()}`}
            description={terms.term('accountability_chart').description ?? 'Who is accountable for what: seats, not job titles.'}
            action={canEdit ? <StartChart slug={slug} seatLabel={seatLabel} /> : undefined}
          />
        )}
      </Page>
    )
  }

  const [ppl, ags, prios] = await Promise.all([listPeople(ctx), listAgents(ctx), listPriorities(ctx, { quarter: currentQuarter(org) })])
  const { revision } = rev
  const versionText = `Published v${revision.number}${revision.publishedAt ? ` · ${fmtShortDate(revision.publishedAt)}` : ''}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pendingCount > 0 && (
        <div className="px-4 pt-3">
          <ProposalsBanner count={pendingCount} org={slug} />
        </div>
      )}
      <ChartWorkspace
        key={`${revision.id}:${editing}`}
        slug={slug}
        title={title}
        seatLabel={seatLabel}
        mode={editing ? 'edit' : 'view'}
        revisionId={revision.id}
        number={revision.number}
        versionText={versionText}
        seats={flatten(rev.seats)}
        people={ppl.map((p) => ({ id: p.id, name: p.name }))}
        agents={ags.map((a) => ({ id: a.id, name: a.name }))}
        priorities={prios.map((p) => ({ id: p.id, title: p.title }))}
        canPublish={hasRole(ctx, 'admin')}
        hasDraft={!!chart.draft}
        canEdit={canEdit}
      />
    </div>
  )
}
