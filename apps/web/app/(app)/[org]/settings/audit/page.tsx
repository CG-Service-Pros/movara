import Link from 'next/link'
import { listAgents, listAudit, listPeople } from '@motion/core'
import { Button } from '@motion/ui/button'
import { Input } from '@motion/ui/input'
import { Page } from '@/components/shell/page'
import { ActorChip } from '@/components/settings/actor'
import { NativeSelect, SettingsBody, fmtDate } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

type Search = { actor?: string; type?: string; cmd?: string; cursor?: string }

function summarize(diff: { before?: unknown; after?: unknown } | null) {
  const after = diff?.after
  if (!after || typeof after !== 'object') return ''
  return Object.entries(after as Record<string, unknown>).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')
}

export default async function AuditPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Search> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx } = await getOrgContext(slug)
  const [{ items, nextCursor }, agents, people] = await Promise.all([
    listAudit(ctx, {
      actorId: sp.actor || undefined,
      actorType: sp.type === 'agent' || sp.type === 'person' ? sp.type : undefined,
      commandPrefix: sp.cmd || undefined,
      cursor: sp.cursor || undefined,
      limit: 50,
    }),
    listAgents(ctx, { includeRevoked: true }),
    listPeople(ctx),
  ])
  const names = Object.fromEntries([...people, ...agents].map((x) => [x.id, x.name]))
  const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()
  return (
    <Page title="Audit log" meta="Every write, by whom">
      <SettingsBody wide>
        <form className="flex flex-wrap items-center gap-2" method="get">
          <NativeSelect name="type" defaultValue={sp.type ?? ''} className="w-36" aria-label="Actor type">
            <option value="">All actors</option><option value="person">People</option><option value="agent">Agents</option>
          </NativeSelect>
          <NativeSelect name="actor" defaultValue={sp.actor ?? ''} className="w-44" aria-label="Actor">
            <option value="">Anyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} (agent)</option>)}
          </NativeSelect>
          <Input name="cmd" defaultValue={sp.cmd ?? ''} placeholder="Command prefix, e.g. priority." className="w-56" aria-label="Command prefix" />
          <Button type="submit">Filter</Button>
          {(sp.actor || sp.type || sp.cmd) && <Button asChild variant="ghost"><Link href={`/${slug}/settings/audit`}>Clear</Link></Button>}
        </form>
        <div className="overflow-x-auto rounded-xl bg-surface shadow-panel">
          <table className="w-full min-w-[720px] text-left text-base" data-testid="audit-table">
            <thead>
              <tr className="border-b border-line text-xs font-[550] text-faint">
                <th className="px-4 py-2 font-[550]">When</th><th className="px-2 py-2 font-[550]">Actor</th><th className="px-2 py-2 font-[550]">Command</th><th className="px-2 py-2 font-[550]">Entity</th><th className="px-4 py-2 font-[550]">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {items.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-body">{fmtDate(e.at)}</td>
                  <td className="px-2 py-2"><ActorChip actor={e.actor} names={names} /></td>
                  <td className="px-2 py-2"><code className="font-mono text-xs text-ink">{e.command}</code></td>
                  <td className="px-2 py-2 text-sm text-body">{e.entityType ?? '-'}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-sm text-body" title={summarize(e.diff)}>{summarize(e.diff)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-body">No events match.</td></tr>}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="flex justify-center">
            <Button asChild><Link href={`/${slug}/settings/audit?${qs({ actor: sp.actor, type: sp.type, cmd: sp.cmd, cursor: nextCursor })}`}>Older events</Link></Button>
          </div>
        )}
      </SettingsBody>
    </Page>
  )
}
