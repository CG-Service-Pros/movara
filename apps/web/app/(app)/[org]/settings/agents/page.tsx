import { getCaptureSettings, listAgents, listApiKeys, listPeople, hasRole } from '@movara/core'
import { Page } from '@/components/shell/page'
import { AgentsList } from '@/components/settings/agents-panel'
import { SettingsBody } from '@/components/settings/ui'
import { requireModule } from '@/lib/ctx'

export default async function AgentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx } = await requireModule(slug, 'agents')
  const [agents, keys, people, capture] = await Promise.all([listAgents(ctx, { includeRevoked: true }), listApiKeys(ctx), listPeople(ctx), getCaptureSettings(ctx)])
  const names = new Map(people.map((p) => [p.id, p.name]))
  const me = (ctx.actor.type === 'person' ? ctx.actor.id : ctx.actor.onBehalfOf)!
  return (
    <Page title="Connected agents" meta={`${agents.filter((a) => a.status !== 'revoked').length} active`}>
      <SettingsBody>
        <AgentsList
          slug={slug}
          meId={me}
          canCreate={hasRole(ctx, 'member')}
          isAdmin={hasRole(ctx, 'admin')}
          autoAccept={capture.autoAcceptFromAgents}
          people={hasRole(ctx, 'admin') ? people.map((p) => ({ id: p.id, name: p.name })) : people.filter((p) => p.id === me).map((p) => ({ id: p.id, name: p.name }))}
          agents={agents.map((a) => ({
            id: a.id, name: a.name, client: a.client, owner: names.get(a.ownerPersonId) ?? 'Unknown', status: a.status,
            lastSeenAt: a.lastSeenAt?.toISOString() ?? null, scopeCount: a.scopes.length, keyCount: keys.filter((k) => k.agentId === a.id && !k.revokedAt).length, preset: a.preset,
          }))}
        />
      </SettingsBody>
    </Page>
  )
}
