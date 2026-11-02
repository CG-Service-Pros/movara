import { Suspense } from 'react'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { getMetric, getPerson, myWeek } from '@motion/core'
import { buttonClasses } from '@motion/ui/button'
import { Card } from '@motion/ui/card'
import { cn } from '@motion/ui/cn'
import { ListRow } from '@motion/ui/list-row'
import { Meter } from '@motion/ui/meter'
import { Skeleton } from '@motion/ui/skeleton'
import { MetricsDue, type DueMetric } from '@/components/home/metrics-due'
import { RecentActivity } from '@/components/home/recent-activity'
import { Muted, Section } from '@/components/home/section'
import { TodoList, type HomeTodo } from '@/components/home/todo-list'
import { fmtDate, quarterLabel } from '@/components/priorities/format'
import { meterTone, PriorityGlyph } from '@/components/priorities/status'
import type { PStatus } from '@/components/priorities/types'
import { Page } from '@/components/shell/page'
import { getOrgContext } from '@/lib/ctx'

function goalText(m: Awaited<ReturnType<typeof getMetric>>): string {
  if (m.goal === null) return ''
  const sym = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', between: '' }[m.comparison]
  const pre = m.unit === 'currency' ? '$' : ''
  const post = m.unit === 'percent' ? '%' : ''
  return m.comparison === 'between' ? `Goal ${pre}${m.goal}${post} to ${pre}${m.goalUpper ?? m.goal}${post}` : `Goal ${sym} ${pre}${m.goal}${post}`
}

function greeting(tz: string): string {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz || 'UTC' })) % 24
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default async function HomePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, org, terms, modules } = await getOrgContext(slug)
  const mw = await myWeek(ctx)
  const me = await getPerson(ctx, mw.personId)
  const tz = org.timezone || 'UTC'
  const base = `/${slug}`
  const P = terms.t('priority', 'plural')

  const due: DueMetric[] = modules.scorecard
    ? await Promise.all(
        mw.metricsDue.map(async (d) => {
          const m = await getMetric(ctx, d.id)
          return { id: d.id, title: d.title, periodStart: d.periodStart, goalText: goalText(m), unit: m.unit, teamName: '' }
        }),
      )
    : []

  const todos: HomeTodo[] = mw.todos.map((t) => ({
    id: t.id,
    title: t.title,
    dueLabel: t.dueDate ? fmtDate(t.dueDate, mw.today) : null,
    overdue: t.overdue,
    pending: t.status === 'pending',
  }))

  const next = mw.nextMeeting
  const when = next
    ? new Date(next.scheduledAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })
    : null
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
  const first = me.name.split(' ')[0]

  const meetingCard = (
    <Card className={cn('overflow-hidden', next ? 'bg-accent text-white shadow-none' : '')}>
                  {next ? (
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="text-sm opacity-80">{next.live ? 'Happening now' : 'Next meeting'}</div>
                        <div className="mt-0.5 truncate text-lg font-semibold">{next.name}</div>
                        <div className="mt-0.5 text-sm opacity-80">{when}</div>
                      </div>
                      <Link
                        href={`${base}/meetings/${next.id}`}
                        className={cn(buttonClasses('secondary', 'md'), 'h-8 rounded-full bg-white/20 px-4 text-sm text-white shadow-none hover:bg-white/30')}
                      >
                        {next.live ? 'Join now' : 'Join'}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 text-body">
                      <CalendarClock size={18} strokeWidth={1.7} className="text-icon" />
                      <div>
                        <div className="text-base font-semibold text-ink">No meeting scheduled</div>
                        <div className="text-sm">Your next {terms.t('weekly_meeting', 'singular').toLowerCase()} will show up here.</div>
                      </div>
                    </div>
                  )}
                </Card>
  )

  return (
    <Page title="Home" meta={<span className="text-body">My week</span>}>
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-6 sm:px-6">
        <header className="mb-6">
          <p className="text-sm text-body">
            {dateLine} · Week {mw.week.week} of {mw.week.of} · {quarterLabel(mw.quarter)}
          </p>
          <h2 className="mt-1 text-[28px] font-[680] leading-tight tracking-[-0.025em] text-ink">
            {greeting(tz)}, {first}
          </h2>
        </header>

        {modules.meetings && <div className="mb-5 lg:hidden">{meetingCard}</div>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            {modules.priorities && (
              <Section title={`My ${P.toLowerCase()}`} meta={mw.priorities.length ? mw.priorities.length : undefined} href={`${base}/priorities?tab=mine`} flush>
                {mw.priorities.length === 0 ? (
                  <Muted>No {P.toLowerCase()} are assigned to you this quarter.</Muted>
                ) : (
                  <div className="flex flex-col">
                    {mw.priorities.map((p) => {
                      const status = p.status as PStatus
                      return (
                        <ListRow
                          key={p.id}
                          asChild
                          leading={<PriorityGlyph status={status} />}
                          title={p.title}
                          trailing={
                            <>
                              <span className="flex items-center gap-2">
                                <Meter value={p.milestonesTotal ? p.milestonesDone / p.milestonesTotal : status === 'done' ? 1 : 0} tone={meterTone(status)} className="w-11" />
                                <span className="min-w-[26px] text-xs tabular-nums text-body">{p.milestonesTotal ? `${p.milestonesDone}/${p.milestonesTotal}` : '–'}</span>
                              </span>
                              <span className="hidden w-[52px] text-right text-sm tabular-nums sm:inline">{fmtDate(p.dueDate, mw.today)}</span>
                            </>
                          }
                        >
                          <Link href={`${base}/priorities?id=${p.id}`} />
                        </ListRow>
                      )
                    })}
                  </div>
                )}
              </Section>
            )}

            {modules.scorecard && (
              <Section title="Report your numbers" meta={due.length ? `${due.length} to report` : undefined} href={`${base}/scorecard`} linkLabel="Scorecard">
                {due.length === 0 ? <Muted>Everything you own is reported for this period.</Muted> : <MetricsDue slug={slug} metrics={due} />}
              </Section>
            )}

            {modules.todos && (
              <Section title={`My ${terms.t('todo', 'plural').toLowerCase()}`} meta={todos.length ? `${todos.length} open` : undefined} href={`${base}/todos`}>
                {todos.length === 0 ? <Muted>You are all caught up.</Muted> : <TodoList slug={slug} todos={todos} />}
              </Section>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {modules.meetings && <div className="max-lg:hidden">{meetingCard}</div>}

            <Suspense
              fallback={
                <Card className="space-y-3 p-4">
                  <Skeleton className="h-4 w-32" />
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Skeleton className="size-5 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-4/5" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </Card>
              }
            >
              <RecentActivity ctx={ctx} terms={terms} />
            </Suspense>
          </div>
        </div>
      </div>
    </Page>
  )
}
