import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarClock, Users } from 'lucide-react'
import { nextOccurrence, getOrg, listAgents, listMeetingHistory, listMeetingSeries, listMeetingTemplates, listMeetings, listPeople, listTeams, todayIn } from '@movara/core'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { EmptyState } from '@movara/ui/empty-state'
import { describeCadence, fmtDay, fmtTime, fmtWeekday } from '@/components/meetings/format'
import { NewMeetingDialog } from '@/components/meetings/new-meeting-dialog'
import { StartButton } from '@/components/meetings/start-button'
import { Page } from '@/components/shell/page'
import { requireModule } from '@/lib/ctx'

const SECTION_KEYS = ['check_in', 'metric_review', 'priority_review', 'headline_review', 'todo_review', 'issue_solving', 'wrap_up'] as const

export default async function MeetingsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ id?: string; new?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  // Deep link: ?id=<meetingId> goes straight to that meeting.
  if (sp.id) redirect(`/${slug}/meetings/${sp.id}`)
  const { ctx, terms } = await requireModule(slug, 'meetings')
  const [org, series, upcoming, history, teams, templates, people, agents] = await Promise.all([
    getOrg(ctx),
    listMeetingSeries(ctx),
    listMeetings(ctx, { status: 'upcoming' }),
    listMeetingHistory(ctx, { limit: 30 }),
    listTeams(ctx),
    listMeetingTemplates(ctx),
    listPeople(ctx),
    listAgents(ctx),
  ])
  const tz = org.timezone
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '–'
  const meetingWord = terms.t('weekly_meeting')
  const nextOf = (seriesId: string) => upcoming.filter((m) => m.seriesId === seriesId).sort((a, b) => (a.status === 'live' ? -1 : b.status === 'live' ? 1 : +a.scheduledAt - +b.scheduledAt))[0]
  const myTeam = teams.find((t) => t.members.some((m) => ctx.actor.type === 'person' && m.personId === ctx.actor.id)) ?? teams[0]

  const dialog = teams.length > 0 && (
    <NewMeetingDialog
      defaultOpen={sp.new === '1'}
      data={{
        slug,
        defaultTeamId: myTeam!.id,
        teams: teams.map((t) => ({ id: t.id, name: t.name, memberIds: t.members.map((m) => m.personId) })),
        people: people.map((p) => ({ id: p.id, name: p.name })),
        templates: templates.map((t) => ({ key: t.key, name: t.name, agenda: t.agenda })),
        agents: agents.filter((a) => a.status !== 'revoked' && (a.scopes as string[]).some((s) => s === 'write:meetings' || s === 'admin')).map((a) => ({ id: a.id, name: a.name })),
        sectionTerms: SECTION_KEYS.map((k) => ({ key: k, label: terms.t(k, 'short') })),
        labels: { meeting: meetingWord, newMeeting: `New ${meetingWord.toLowerCase()}` },
        today: todayIn(org),
      }}
    />
  )

  return (
    <Page title={terms.t('weekly_meeting', 'plural')} meta={<span>{series.length} series</span>} actions={dialog}>
      <div className="w-full px-6 pb-12 pt-6 lg:px-8">
        {series.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title={`No ${terms.t('weekly_meeting', 'plural').toLowerCase()} yet`}
            description={terms.term('weekly_meeting').description ?? 'Set up a recurring meeting for a team.'}
            action={dialog || undefined}
          />
        ) : (
          <>
            <h2 className="text-sm font-[600] text-ink">Series</h2>
            <div className="mt-2 divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]" data-testid="series-list">
              {series.map((s) => {
                const next = nextOf(s.id)
                const live = next?.status === 'live'
                return (
                  <div key={s.id} className="grid min-h-14 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={next ? `/${slug}/meetings/${next.id}` : `/${slug}/meetings`} className="truncate text-base font-[600] text-ink hover:underline">{s.name}</Link>
                        {live && (
                          <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-danger-soft px-2 text-xs font-[650] text-danger-text"><span className="size-1.5 rounded-full bg-danger" />Live</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-faint"><Users size={12} /> {teamName(s.teamId)} · {s.attendeeIds.length} attendees</div>
                    </div>
                    <div className="text-sm text-body">{describeCadence(s.rrule, s.startTime)}</div>
                    <div className="text-sm tabular-nums text-body">
                      {live ? <span className="text-danger-text">Started {fmtTime(next!.startedAt!, tz)}</span> : next ? <>{fmtWeekday(next.scheduledAt, tz)} <span className="text-faint">· {fmtTime(next.scheduledAt, tz)}</span></> : (() => {
                        const n = nextOccurrence(s.rrule, s.startTime, tz, new Date())
                        return n ? <>{fmtWeekday(n, tz)} <span className="text-faint">· {fmtTime(n, tz)}</span></> : <span className="text-faint">Not scheduled</span>
                      })()}
                    </div>
                    <div className="flex justify-end gap-2">
                      {live ? (
                        <Button size="sm" variant="primary" asChild><Link href={`/${slug}/meetings/${next!.id}`}>Join</Link></Button>
                      ) : (
                        <>
                          {next && <Button size="sm" variant="ghost" asChild><Link href={`/${slug}/meetings/${next.id}`}>Open</Link></Button>}
                          <StartButton slug={slug} seriesId={s.id} />
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <h2 className="mt-8 text-sm font-[600] text-ink">Past {terms.t('weekly_meeting', 'plural').toLowerCase()}</h2>
            {history.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-body">Nothing here until the first meeting ends.</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]" data-testid="history">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line-faint text-xs font-[550] text-faint">
                      <th className="h-9 px-4 font-[550]">Date</th>
                      <th className="font-[550]">Meeting</th>
                      <th className="text-right font-[550]">Duration</th>
                      <th className="text-right font-[550]">Rating</th>
                      <th className="text-right font-[550]">{terms.t('issue', 'plural')} solved</th>
                      <th className="px-4 text-right font-[550]">{terms.t('todo', 'plural')} done</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-faint tabular-nums">
                    {history.map((h) => (
                      <tr key={h.meetingId} className="h-11 hover:bg-canvas">
                        <td className="px-4"><Link href={`/${slug}/meetings/${h.meetingId}`} className="font-[500] text-ink hover:underline">{fmtDay(h.startedAt ?? h.endedAt, tz, true)}</Link></td>
                        <td className="text-body">{h.seriesName}</td>
                        <td className="text-right text-body">{h.durationMinutes} min</td>
                        <td className="text-right">{h.ratingAvg != null ? <Badge tone={h.ratingAvg >= 8 ? 'success' : 'neutral'}>{h.ratingAvg}</Badge> : <span className="text-faint">–</span>}</td>
                        <td className="text-right text-body">{h.issuesTotal ? `${h.issuesSolved}/${h.issuesTotal}` : <span className="text-faint">–</span>}</td>
                        <td className="px-4 text-right text-body">{h.todosTotal ? `${h.todosDone}/${h.todosTotal}` : <span className="text-faint">–</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
