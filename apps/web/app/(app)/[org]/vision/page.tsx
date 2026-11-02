import { currentQuarter, getVisionRevision, getVision, hasRole, listAgents, listApprovals, listIssues, listPeople, listPriorities, listVisionRevisions, sectionsOf, isMotionError } from '@motion/core'
import { EmptyState } from '@motion/ui/empty-state'
import { Badge } from '@motion/ui/badge'
import { Button } from '@motion/ui/button'
import { Target } from 'lucide-react'
import Link from 'next/link'
import { NavIcon } from '@/components/shell/icons'
import { Page, PageBody } from '@/components/shell/page'
import { requireModule } from '@/lib/ctx'
import { PrintHeader, PrintStyles } from '@/components/vision/print'
import { ProposalsBanner } from '@/components/vision/proposals-banner'
import { fmtShortDate, normalizeSections, type RevisionLite, type VisionLabels } from '@/components/vision/shared'
import { VisionDocument } from '@/components/vision/vision-doc'
import { VisionEditor } from '@/components/vision/vision-editor'
import { StartDraftButton, VisionViewActions } from '@/components/vision/vision-view-actions'

export default async function VisionPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ rev?: string; edit?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, org, terms } = await requireModule(slug, 'vision')

  const labels: VisionLabels = {
    vision: terms.t('vision_plan', 'singular'),
    coreValues: terms.t('core_values', 'plural'),
    coreFocus: terms.t('core_focus', 'singular'),
    longRangeTarget: terms.t('long_range_target', 'singular'),
    marketing: terms.t('marketing_strategy', 'singular'),
    threeYear: terms.t('three_year_picture', 'singular'),
    oneYear: terms.t('one_year_plan', 'singular'),
    quarterly: terms.t('quarterly_plan', 'singular'),
    longTermIssues: terms.t('long_term_issues', 'plural'),
    priority: terms.t('priority', 'plural'),
  }

  const view = await getVision(ctx)
  let shown = view.published
  let viewingOld = false
  if (sp.rev) {
    try {
      const r = await getVisionRevision(ctx, sp.rev)
      if (r.planId === view.plan?.id) {
        shown = r
        viewingOld = r.id !== view.published?.id
      }
    } catch (e) {
      if (!isMotionError(e)) throw e
    }
  }
  const editing = sp.edit && view.draft && hasRole(ctx, 'member') ? view.draft : null
  const doc = editing ?? shown

  // Empty states.
  if (!doc && !view.draft) {
    return (
      <Page title={labels.vision}>
        <EmptyState
          icon={<NavIcon name="vision" size={18} />}
          title="Start your vision plan"
          description={terms.term('vision_plan').description ?? 'Where the company is going and how it gets there, on one page.'}
          action={hasRole(ctx, 'member') ? <StartDraftButton slug={slug} label="Start your vision plan" /> : undefined}
        />
      </Page>
    )
  }
  if (!doc && view.draft) {
    return (
      <Page title={labels.vision} meta={<Badge tone="warning">Draft v{view.draft.number}</Badge>}>
        <EmptyState
          icon={<Target />}
          title="Nothing is published yet"
          description="A draft is in progress. Publish it to make it the company's vision plan."
          action={
            <Button variant="primary" asChild>
              <Link href={`/${slug}/vision?edit=1`}>Continue draft</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const [revs, pending, ppl, ags] = await Promise.all([listVisionRevisions(ctx), listApprovals(ctx, { status: 'pending', limit: 200 }), listPeople(ctx), listAgents(ctx, { includeRevoked: true })])
  const pendingCount = pending.items.filter((a) => a.action.startsWith('vision.')).length
  const names: Record<string, string> = {}
  for (const p of ppl) names[p.id] = p.name
  for (const a of ags) names[a.id] = a.name

  const sections = normalizeSections(sectionsOf(doc!), currentQuarter(org))
  const quarter = sections.quarterly.quarter
  const [qPriorities, longIssues] = await Promise.all([listPriorities(ctx, { quarter }), listIssues(ctx, { horizon: 'long', status: 'all' })])
  const allPriorities = qPriorities.filter((p) => p.level === 'company').map((p) => ({ id: p.id, title: p.title, status: p.status }))
  const priorityPool = allPriorities.length ? allPriorities : qPriorities.map((p) => ({ id: p.id, title: p.title, status: p.status }))
  const linked = sections.quarterly.priorityIds
  const priorities = linked.length ? linked.map((id) => qPriorities.find((p) => p.id === id)).filter((p) => !!p).map((p) => ({ id: p!.id, title: p!.title, status: p!.status })) : priorityPool
  const issueTitle = new Map(longIssues.map((i) => [i.id, i.title]))
  const issues = sections.longTermIssueIds.filter((id) => issueTitle.has(id)).map((id) => ({ id, title: issueTitle.get(id)! }))

  if (editing) {
    const options = longIssues.filter((i) => i.status === 'open' || sections.longTermIssueIds.includes(i.id)).map((i) => ({ id: i.id, title: i.title }))
    return (
      <VisionEditor
        key={editing.id}
        slug={slug}
        wordmark={org.branding.wordmark || org.name}
        revisionId={editing.id}
        number={editing.number}
        initial={sections}
        labels={labels}
        names={names}
        priorities={priorityPool}
        issues={options}
        canPublish={hasRole(ctx, 'admin')}
      />
    )
  }

  const revisions: RevisionLite[] = revs.map((r) => ({ id: r.id, number: r.number, status: r.status, date: r.publishedAt ? fmtShortDate(r.publishedAt) : null, by: r.publishedBy ? (names[r.publishedBy.id] ?? null) : null }))
  const rev = doc!
  const versionText = `${rev.status === 'published' ? 'Published' : 'Archived'} v${rev.number}${rev.publishedAt ? ` · ${fmtShortDate(rev.publishedAt)}` : ''}`
  const wordmark = org.branding.wordmark || org.name

  return (
    <>
      <PrintStyles />
      <Page
        title={labels.vision}
        meta={<Badge tone={viewingOld ? 'warning' : 'neutral'}>{versionText}</Badge>}
        actions={<VisionViewActions slug={slug} revisions={revisions} currentId={rev.id} hasDraft={!!view.draft} canEdit={hasRole(ctx, 'member')} />}
        data-print-hide
        bodyClassName="px-6 py-5"
      >
        <div data-print-body>
          <ProposalsBanner count={pendingCount} org={slug} />
          {viewingOld && (
            <div data-print-hide className="mx-auto mb-4 flex max-w-[1100px] items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-[550] text-warning-text">
              You are reading an older revision.
              <Link href={`/${slug}/vision`} className="ml-auto underline">
                Back to the current one
              </Link>
            </div>
          )}
          {view.draft && !viewingOld && (
            <div data-print-hide className="mx-auto mb-4 flex max-w-[1100px] items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm text-body">
              Draft v{view.draft.number} is in progress.
              <Link href={`/${slug}/vision?edit=1`} className="ml-auto font-[550] text-accent-text hover:underline">
                Continue editing
              </Link>
            </div>
          )}
          <PrintHeader wordmark={wordmark} title={labels.vision} meta={versionText} />
          <VisionDocument sections={sections} labels={labels} names={names} priorities={priorities} issues={issues} />
        </div>
      </Page>
    </>
  )
}
