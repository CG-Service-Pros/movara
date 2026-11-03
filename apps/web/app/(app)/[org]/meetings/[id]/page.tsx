import { getMeeting } from '@movara/core'
import { loadBundle } from '@/components/meetings/bundle'
import { LiveMeeting } from '@/components/meetings/live-meeting'
import { MeetingSummary } from '@/components/meetings/summary'
import { assertRouteId, orNotFound, requireModule } from '@/lib/ctx'

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id: rawId } = await params
  const id = assertRouteId(rawId)
  const { ctx } = await requireModule(slug, 'meetings')
  const meeting = await orNotFound(getMeeting(ctx, id))
  const bundle = await loadBundle(ctx, id)
  if (meeting.status === 'ended') return <MeetingSummary slug={slug} b={bundle} />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LiveMeeting slug={slug} initial={bundle} />
    </div>
  )
}
