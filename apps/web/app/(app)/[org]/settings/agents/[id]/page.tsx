import Link from 'next/link'
import { getAgent, getPerson, hasRole, listApiKeys, actingPersonId } from '@motion/core'
import { Page } from '@/components/shell/page'
import { AgentDetail } from '@/components/settings/agent-detail'
import { SettingsBody } from '@/components/settings/ui'
import { requireModule } from '@/lib/ctx'
import { appUrl } from '@/components/settings/app-url'

export default async function AgentPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params
  const { ctx } = await requireModule(slug, 'agents')
  const agent = await getAgent(ctx, id)
  const [keys, owner] = await Promise.all([listApiKeys(ctx, id), getPerson(ctx, agent.ownerPersonId)])
  const canManage = hasRole(ctx, 'admin') || agent.ownerPersonId === actingPersonId(ctx)
  return (
    <Page title={agent.name} meta={<Link href={`/${slug}/settings/agents`} className="text-body hover:text-ink">Connected agents</Link>}>
      <SettingsBody>
        <AgentDetail
          slug={slug}
          canManage={canManage}
          mcpUrl={`${await appUrl()}/mcp`}
          agent={{
            id: agent.id, name: agent.name, client: agent.client, owner: owner.name, status: agent.status, lastSeenAt: agent.lastSeenAt?.toISOString() ?? null, scopes: agent.scopes,
            keys: keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, expiresAt: k.expiresAt?.toISOString() ?? null })),
          }}
        />
      </SettingsBody>
    </Page>
  )
}
