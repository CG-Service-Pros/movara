import Link from 'next/link'
import { actingPersonId, hasRole, listAgents, listApiKeys } from '@movara/core'
import { AgentMark } from '@movara/ui/agent-mark'
import { Badge } from '@movara/ui/badge'
import { Page } from '@/components/shell/page'
import { Mono, Panel, SettingsBody, Section, ago, fmtDate } from '@/components/settings/ui'
import { RevokeKeyButton } from '@/components/settings/revoke-key-button'
import { appUrl } from '@/components/settings/app-url'
import { requireModule } from '@/lib/ctx'

export default async function KeysPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx } = await requireModule(slug, 'agents')
  const [agents, keys] = await Promise.all([listAgents(ctx, { includeRevoked: true }), listApiKeys(ctx)])
  const mcp = `${await appUrl()}/mcp`
  return (
    <Page title="MCP & API keys" meta={`${keys.filter((k) => !k.revokedAt).length} active`}>
      <SettingsBody>
        <div className="rounded-xl bg-canvas p-4 text-base text-body">
          MCP endpoint <Mono>{mcp}</Mono>. MCP clients like Claude sign in with OAuth; scripts and workflows use the API keys below. Keys are shown once when issued; issue them from an agent&apos;s page.
        </div>
        {agents.map((a) => {
          const list = keys.filter((k) => k.agentId === a.id)
          return (
            <Section key={a.id} title={<span className="inline-flex items-center gap-2"><AgentMark size={20} /><Link href={`/${slug}/settings/agents/${a.id}`} className="hover:underline">{a.name}</Link></span>}>
              <Panel>
                {list.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-[550] text-ink">{k.name || 'Unnamed key'}</div>
                      <div className="text-sm text-body"><Mono>{k.prefix}…</Mono> · created {fmtDate(k.createdAt)} · last used {ago(k.lastUsedAt)}</div>
                    </div>
                    {k.revokedAt ? <Badge tone="danger">Revoked</Badge> : (hasRole(ctx, 'admin') || a.ownerPersonId === actingPersonId(ctx)) ? <RevokeKeyButton slug={slug} keyId={k.id} /> : null}
                  </div>
                ))}
                {list.length === 0 && <div className="px-4 py-5 text-center text-base text-body">No keys.</div>}
              </Panel>
            </Section>
          )
        })}
        {agents.length === 0 && <div className="rounded-xl bg-surface px-4 py-10 text-center text-base text-body shadow-panel">No agents yet. Create one under Connected agents.</div>}
      </SettingsBody>
    </Page>
  )
}
