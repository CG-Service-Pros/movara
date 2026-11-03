import { actingPersonId, hasRole, listAgents, listApprovals, listPeople } from '@movara/core'
import { Page } from '@/components/shell/page'
import { ApprovalsPanel, type ApprovalItem } from '@/components/settings/approvals-panel'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function ApprovalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx } = await getOrgContext(slug)
  const [{ items }, agents, people] = await Promise.all([listApprovals(ctx, { limit: 100 }), listAgents(ctx, { includeRevoked: true }), listPeople(ctx)])
  const names = Object.fromEntries([...people, ...agents].map((x) => [x.id, x.name]))
  const me = actingPersonId(ctx)
  const ownerOf = new Map(agents.map((x) => [x.id, x.ownerPersonId]))
  const rows: ApprovalItem[] = items.map((a) => ({
    canDecide: ctx.actor.type === 'person' && (hasRole(ctx, 'admin') || (a.requestedByActor.type === 'agent' && ownerOf.get(a.requestedByActor.id) === me)),
    id: a.id, action: a.action, summary: a.summary, payload: a.payload, status: a.status, requestedBy: a.requestedByActor, decidedBy: a.decidedBy,
    createdAt: a.createdAt.toISOString(), decidedAt: a.decidedAt?.toISOString() ?? null, note: a.decisionNote,
    error: a.result && typeof a.result === 'object' && 'error' in (a.result as object) ? String((a.result as { error: unknown }).error) : null,
  }))
  return (
    <Page title="Approvals" meta={`${rows.filter((r) => r.status === 'pending').length} pending`}>
      <SettingsBody wide>
        <ApprovalsPanel slug={slug} items={rows} names={names} canDecide={hasRole(ctx, 'member')} />
      </SettingsBody>
    </Page>
  )
}
