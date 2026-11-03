import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { hasRole, listMeetingCaptures, listPendingCaptures } from '@movara/core'
import { EmptyState } from '@movara/ui/empty-state'
import { Page } from '@/components/shell/page'
import { ItemsReview } from '@/components/capture/items-review'
import { SourceBadge, timeAgo } from '@/components/capture/format'
import { NoteCard } from '@/components/capture/meeting-captures'
import { captureLabels, loadPeopleAndAgents } from '@/components/capture/load'
import { itemView, noteView } from '@/components/capture/types'
import { getOrgContext } from '@/lib/ctx'

const DOCS = 'https://github.com/movara-app/movara/blob/main/docs/mcp-setup.md'

export default async function InboxPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, terms } = await getOrgContext(slug)
  const { count, items } = await listPendingCaptures(ctx, { limit: 200 })
  const { opts, names } = await loadPeopleAndAgents(ctx)
  const canDecide = ctx.actor.type === 'person' && hasRole(ctx, 'member')
  const labels = captureLabels(terms)

  // Group by meeting; the query is newest first, so group order follows the newest item.
  const groups = new Map<string, { meeting: (typeof items)[number]['meeting']; notesIds: Set<string>; items: typeof items }>()
  for (const it of items) {
    const g = groups.get(it.meeting.id) ?? { meeting: it.meeting, notesIds: new Set<string>(), items: [] }
    g.notesIds.add(it.notes.id)
    g.items.push(it)
    groups.set(it.meeting.id, g)
  }
  const detail = await Promise.all([...groups.values()].map(async (g) => ({ g, caps: await listMeetingCaptures(ctx, g.meeting.id, { includeTranscript: true }) })))

  return (
    <Page title="Inbox" meta={count > 0 ? `${count} to review` : 'Meeting notes and action items'}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-6 py-6 lg:px-8">
        {detail.length === 0 && (
          <EmptyState
            icon={<Inbox />}
            title="Nothing to review"
            description="When your notes app pushes meeting notes and action items to Movara, the proposals wait here for you to accept, edit or reject."
            action={
              <div className="flex flex-col items-center gap-3">
                <p className="max-w-md text-sm text-body">
                  Connect Granola or Plaud through an agent that has access to your notes: give it the <strong className="font-[600] text-ink">Notes integration</strong> preset and ask it to push notes after each meeting with <code className="rounded-sm bg-canvas px-1 font-mono text-xs">meeting_capture_notes</code>.
                </p>
                <div className="flex gap-2">
                  <Link href={`/${slug}/settings/agents`} className="inline-flex h-7 items-center rounded-md bg-accent px-3 text-sm font-[550] text-white hover:opacity-90">Connected agents</Link>
                  <a href={DOCS} target="_blank" rel="noreferrer noopener" className="inline-flex h-7 items-center rounded-md px-3 text-sm font-[550] text-body shadow-[0_0_0_1px_var(--m-line)] hover:text-ink">Setup guide</a>
                </div>
              </div>
            }
          />
        )}
        {detail.map(({ g, caps }) => {
          const notes = caps.notes.filter((n) => g.notesIds.has(n.id)).map((n) => noteView(n, names))
          const mine = g.items.map(itemView)
          return (
            <section key={g.meeting.id} className="flex flex-col gap-3" data-testid="inbox-group">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  <Link href={`/${slug}/meetings/${g.meeting.id}`} className="hover:underline">{g.meeting.title}</Link>
                </h2>
                <span className="text-sm text-body">
                  {g.meeting.teamName} · {new Date(g.meeting.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-faint">{[...new Set(g.items.map((i) => i.notes.sourceApp))].map((a) => <SourceBadge key={a} app={a} />)}{timeAgo(g.items[0]!.createdAt.toISOString())}</span>
              </div>
              {notes.map((n) => <NoteCard key={n.id} note={n} />)}
              <ItemsReview slug={slug} items={mine} people={opts} canDecide={canDecide} labels={labels} />
            </section>
          )
        })}
      </div>
    </Page>
  )
}
