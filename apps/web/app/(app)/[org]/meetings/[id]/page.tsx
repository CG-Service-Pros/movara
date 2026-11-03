import { getMeeting, hasRole } from '@movara/core'
import { loadBundle } from '@/components/meetings/bundle'
import { LiveMeeting } from '@/components/meetings/live-meeting'
import { MeetingSummary } from '@/components/meetings/summary'
import { MeetingCaptures } from '@/components/capture/meeting-captures'
import { captureLabels, loadMeetingCaptures } from '@/components/capture/load'
import { assertRouteId, orNotFound, requireModule } from '@/lib/ctx'

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id: rawId } = await params
  const id = assertRouteId(rawId)
  const { ctx, terms } = await requireModule(slug, 'meetings')
  const meeting = await orNotFound(getMeeting(ctx, id))
  const [bundle, captures] = await Promise.all([loadBundle(ctx, id), loadMeetingCaptures(ctx, id)])
  const capture = { ...captures, canDecide: ctx.actor.type === 'person' && hasRole(ctx, 'member'), labels: captureLabels(terms) }
  if (meeting.status === 'ended') return <MeetingSummary slug={slug} b={bundle} capture={capture} />
  const hasCaptures = captures.notes.length > 0 || captures.items.length > 0
  const pending = captures.items.filter((i) => i.status === 'proposed').length
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Agents may push notes into a meeting that has not started yet: show them above the pre-start view. */}
      {hasCaptures && meeting.status === 'scheduled' && (
        <details open={pending > 0} className="group max-h-[55vh] shrink-0 overflow-auto border-b border-line bg-canvas/40" data-testid="scheduled-captures">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-2.5 text-sm font-[600] text-ink outline-none hover:bg-canvas/60 focus-visible:bg-canvas">
            Notes &amp; action items{pending > 0 ? ` · ${pending} to review` : ''}
            <span className="ml-auto text-xs font-[500] text-faint group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs font-[500] text-faint group-open:inline">Hide</span>
          </summary>
          <div className="mx-auto w-full max-w-[1200px] px-6 pb-5">
            <MeetingCaptures slug={slug} {...capture} hideTitle />
          </div>
        </details>
      )}
      <LiveMeeting slug={slug} initial={bundle} />
    </div>
  )
}
