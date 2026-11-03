import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'
import { Badge } from '@movara/ui/badge'
import { PageHeader } from '@movara/ui/page-header'
import { cn } from '@movara/ui/cn'
import { Captured, Owner, Tick } from './parts'
import { fmtDate, fmtDay, fmtTime } from './format'
import { MeetingCaptures } from '@/components/capture/meeting-captures'
import type { CaptureItemView, CaptureLabels, CaptureNoteView, PersonOpt } from '@/components/capture/types'
import type { Bundle } from './types'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
      <div className="text-xs font-[550] text-faint">{label}</div>
      <div className={cn('mt-1 text-[26px] font-[620] leading-none tracking-[-0.02em] tabular-nums', tone === 'success' ? 'text-success-text' : 'text-ink')}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-faint tabular-nums">{sub}</div>}
    </div>
  )
}

/** Read-only recap of an ended meeting. */
export type SummaryCapture = { notes: CaptureNoteView[]; items: CaptureItemView[]; people: PersonOpt[]; canDecide: boolean; labels?: CaptureLabels }

export function MeetingSummary({ slug, b, capture }: { slug: string; b: Bundle; capture?: SummaryCapture }) {
  const { live } = b
  const st = live.stats
  const L = (k: string, form: 's' | 'p' = 's') => (b.labels[k]?.[form] ?? k).toLowerCase()
  const ratings = live.ratings.all ?? {}
  const rated = Object.entries(ratings).sort((a, c) => c[1] - a[1])
  const solved = b.issues.filter((i) => live.ids.solvedIssueIds.includes(i.id))
  const unsolved = b.issues.filter((i) => live.ids.discussedIssueIds.includes(i.id) && !live.ids.solvedIssueIds.includes(i.id))
  const added = b.issues.filter((i) => live.ids.addedIssueIds.includes(i.id) && !live.ids.discussedIssueIds.includes(i.id))
  const newTodos = b.todos.filter((t) => live.newTodoIds.includes(t.id))
  const present = live.presence.filter((p) => p.kind === 'person')
  const agents = live.presence.filter((p) => p.kind === 'agent')
  const duration = st?.durationMinutes ?? (live.startedAt && live.endedAt ? Math.round((+new Date(live.endedAt) - +new Date(live.startedAt)) / 60000) : 0)
  const planned = live.agenda.reduce((n, a) => n + a.minutes, 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link href={`/${slug}/meetings`} aria-label="Back to meetings" className="grid size-6 place-items-center rounded-md text-icon hover:bg-nav-active hover:text-ink"><ChevronLeft size={15} /></Link>
            {live.name}
          </span>
        }
        meta={<><span>{fmtDay(live.startedAt ?? live.scheduledAt, b.timezone, true)}</span><Badge>Ended</Badge></>}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1200px] px-8 pb-12 pt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="summary-stats">
            <Stat label="Duration" value={`${duration} min`} sub={`planned ${planned} min`} />
            <Stat label="Rating" value={st?.ratingAvg != null ? String(st.ratingAvg) : '–'} sub={`${st?.ratingCount ?? rated.length} rating${(st?.ratingCount ?? rated.length) === 1 ? '' : 's'}`} tone={st?.ratingAvg != null && st.ratingAvg >= 8 ? 'success' : undefined} />
            <Stat label={`${b.labels.issue?.p} solved`} value={`${st?.issuesSolved ?? solved.length}/${st?.issuesTotal ?? solved.length + unsolved.length}`} />
            <Stat label={`${b.labels.todo?.p} done`} value={`${st?.todosDone ?? 0}/${st?.todosTotal ?? 0}`} sub="last week's completion" />
            <Stat label={`New ${L('todo', 'p')}`} value={String(st?.newTodoCount ?? newTodos.length)} sub={`${st?.attendeeCount ?? present.length} of ${st?.invitedCount ?? live.attendees.length} attended`} />
          </div>

          {capture && (capture.notes.length > 0 || capture.items.length > 0) && <MeetingCaptures slug={slug} {...capture} className="mt-6" />}

          {live.summary && (
            <section className="mt-6">
              <h2 className="text-sm font-[600] text-ink">Notes</h2>
              <p className="mt-2 whitespace-pre-line rounded-xl bg-canvas p-4 text-base leading-relaxed text-ink" data-testid="summary-notes">{live.summary}</p>
            </section>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col gap-6">
              <section>
                <h2 className="text-sm font-[600] text-ink">{b.labels.issue?.p} discussed</h2>
                <div className="mt-2 divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]">
                  {[...solved.map((i) => ({ i, ok: true })), ...unsolved.map((i) => ({ i, ok: false }))].map(({ i, ok }) => (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Tick on={ok} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base text-ink">{i.title}</div>
                        {i.description && <div className="truncate text-xs text-faint">{i.description}</div>}
                      </div>
                      <Owner b={b} id={i.ownerId} />
                      <span className="w-16 text-right text-xs text-faint">{ok ? 'Solved' : 'Not solved'}</span>
                    </div>
                  ))}
                  {solved.length + unsolved.length === 0 && <div className="px-4 py-6 text-sm text-faint">No {L('issue', 'p')} were worked in this meeting.</div>}
                </div>
                {added.length > 0 && <p className="mt-2 text-xs text-faint">{added.length} more added to the list, not discussed: {added.map((a) => a.title).join(' · ')}</p>}
              </section>

              <section>
                <h2 className="text-sm font-[600] text-ink">New {L('todo', 'p')}</h2>
                <div className="mt-2 divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]">
                  {newTodos.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Tick on={t.status === 'done'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base text-ink">{t.title}</div>
                        <Captured by={t.createdBy} />
                      </div>
                      <Owner b={b} id={t.ownerId} />
                      <span className="w-12 text-right text-xs text-faint">{fmtDate(t.dueDate)}</span>
                    </div>
                  ))}
                  {newTodos.length === 0 && <div className="px-4 py-6 text-sm text-faint">No new {L('todo', 'p')}.</div>}
                </div>
              </section>
            </div>

            <div className="flex flex-col gap-6">
              <section>
                <h2 className="text-sm font-[600] text-ink">Ratings</h2>
                <div className="mt-2 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
                  {rated.length === 0 && <p className="text-sm text-faint">Nobody rated this meeting.</p>}
                  {rated.map(([pid, score]) => (
                    <div key={pid} className="flex items-center gap-2.5 py-1">
                      <Avatar name={b.people.find((p) => p.id === pid)?.name ?? '?'} size={18} />
                      <span className="w-28 truncate text-sm text-body">{b.people.find((p) => p.id === pid)?.name}</span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-well"><span className="block h-full rounded-full bg-accent" style={{ width: `${score * 10}%` }} /></span>
                      <span className="w-5 text-right text-sm font-[600] tabular-nums text-ink">{score}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="text-sm font-[600] text-ink">In the room</h2>
                <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
                  {present.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 text-sm text-body"><Avatar name={p.name} size={18} />{p.name}</div>
                  ))}
                  {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5 text-sm text-body"><AgentMark size={18} />{a.name}</div>
                  ))}
                  {present.length + agents.length === 0 && <p className="text-sm text-faint">No attendance recorded.</p>}
                  <p className="mt-1 text-xs text-faint">{fmtTime(live.startedAt ?? live.scheduledAt, b.timezone)} – {live.endedAt ? fmtTime(live.endedAt, b.timezone) : ''}</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
