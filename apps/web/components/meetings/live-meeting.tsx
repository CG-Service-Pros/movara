'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Facepile } from '@movara/ui/facepile'
import { Kbd } from '@movara/ui/kbd'
import { Tip } from '@movara/ui/tooltip'
import { toast } from '@movara/ui/toaster'
import { meetingAction, type MeetingOp } from '@/app/(app)/[org]/meetings/[id]/actions'
import { fmtClock, fmtDay } from './format'
import { IdsView } from './ids-view'
import { Tick, type Act } from './parts'
import { CheckInView, GenericView, HeadlinesView, PrioritiesView, ScorecardView, TodoReviewView, WrapUpView } from './section-views'
import type { Bundle } from './types'

const KINDS: Record<string, string> = { check_in: 'checkin', metric_review: 'scorecard', priority_review: 'priorities', headline_review: 'headlines', todo_review: 'todos', issue_solving: 'ids', wrap_up: 'wrapup' }

export function LiveMeeting({ slug, initial }: { slug: string; initial: Bundle }) {
  const router = useRouter()
  const [b, setB] = useState(initial)
  const [now, setNow] = useState<number | null>(null)
  const receivedAt = useRef(0)
  const seq = useRef(0)
  const rev = useRef(initial.live.rev)
  const meetingId = initial.live.meetingId
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const { live } = b

  const apply = useCallback((next: Bundle) => {
    receivedAt.current = Date.now()
    rev.current = next.live.rev
    setB(next)
  }, [])

  // Clock: ticks every 250ms once mounted (SSR renders the server snapshot).
  useEffect(() => {
    receivedAt.current = Date.now()
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  const act: Act = useCallback(
    async (op: MeetingOp, patch) => {
      seq.current++
      if (patch) setB((x) => patch(x))
      const res = await meetingAction(slug, meetingId, op)
      seq.current++
      if (res.ok) apply(res.bundle)
      else {
        toast.error(res.error)
        // Roll the optimistic patch back to the server's truth.
        const r = await fetch(`/${slug}/meetings/${meetingId}/state`, { cache: 'no-store' })
        if (r.ok) apply(await r.json())
      }
      return res
    },
    [slug, meetingId, apply],
  )

  // Live sync: poll with sinceRev; a full refresh every ~15s also pings presence.
  const ended = live.status === 'ended'
  useEffect(() => {
    if (ended) return
    let stop = false
    let n = 0
    const tick = async () => {
      if (stop || document.hidden) return
      n++
      const full = n % 10 === 0
      const mark = seq.current
      try {
        if (full) await fetch(`/${slug}/meetings/${meetingId}/state`, { method: 'POST' })
        const r = await fetch(`/${slug}/meetings/${meetingId}/state${full ? '' : `?sinceRev=${rev.current}`}`, { cache: 'no-store' })
        if (r.status === 200 && !stop && mark === seq.current) apply(await r.json())
      } catch {}
    }
    const t = setInterval(tick, 1500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [slug, meetingId, ended, apply])

  // Join automatically (presence) when viewing a running meeting.
  const joined = useRef(false)
  useEffect(() => {
    if (joined.current || !b.me || (live.status !== 'live' && live.status !== 'paused')) return
    joined.current = true
    if (!live.presence.some((p) => p.id === b.me!.id)) void act({ k: 'join' })
  }, [b.me, live.status, live.presence, act])

  useEffect(() => {
    if (ended) router.refresh()
  }, [ended, router])

  const running = live.status === 'live' || live.status === 'paused'
  const sections = live.agenda
  const idx = live.sectionIndex
  const sectionElapsed = (i: number) => {
    const s = sections[i]!
    return s.elapsedMs + (s.running && now ? now - receivedAt.current : 0)
  }
  const totalElapsed = sections.reduce((sum, _s, i) => sum + sectionElapsed(i), 0)
  const plannedMs = sections.reduce((sum, s) => sum + s.minutes * 60_000, 0)

  const go = useCallback(
    (to: number) => {
      if (!running || to < 0 || to >= sections.length || to === idx) return
      void act({ k: 'section', index: to }, (x) => ({ ...x, live: { ...x.live, sectionIndex: to, agenda: x.live.agenda.map((a, i) => ({ ...a, running: i === to && !x.live.paused })) } }))
    },
    [running, sections.length, idx, act],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('[role="dialog"],[role="menu"],[role="listbox"],[role="radiogroup"],[role="tablist"]'))) return
      if (e.key === 'ArrowRight') go(idx + 1)
      else if (e.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, idx])

  const L = (k: string) => b.labels[k]?.t ?? k.replace(/_/g, ' ')
  const sectionLabel = (term: string) => b.labels[term]?.t ?? term
  const present = live.presence.filter((p) => p.kind === 'person')
  const agentsIn = live.presence.filter((p) => p.kind === 'agent')
  const scribeIn = b.scribe && !agentsIn.some((a) => a.id === b.scribe!.id) ? [b.scribe] : []
  const faces = [
    ...present.map((p) => ({ name: p.name })),
    ...agentsIn.map((a) => ({ name: a.name, agent: true })),
    ...scribeIn.map((a) => ({ name: a.name, agent: true })),
  ]
  const overall = totalElapsed - plannedMs

  const endNow = async () => {
    setEnding(true)
    const r = await act({ k: 'end' })
    setEnding(false)
    setConfirmEnd(false)
    if (r.ok) router.refresh()
  }

  const kind = KINDS[sections[idx]?.term ?? ''] ?? 'generic'
  const remaining = (i: number) => sections[i]!.minutes * 60_000 - sectionElapsed(i)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
        <Tip label="Back to meetings"><Link href={`/${slug}/meetings`} className="grid size-6 place-items-center rounded-md text-icon hover:bg-nav-active hover:text-ink" aria-label="Back to meetings"><ChevronLeft size={15} /></Link></Tip>
        {live.status === 'scheduled' ? (
          <span className="inline-flex h-5 items-center rounded-full bg-canvas px-2 text-xs font-[650] text-body">Scheduled</span>
        ) : (
          <span className={cn('inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-[650]', live.status === 'paused' ? 'bg-warning-soft text-warning-text' : 'bg-danger-soft text-danger-text')} data-testid="live-pill">
            <span className={cn('size-1.5 rounded-full', live.status === 'paused' ? 'bg-warning' : 'bg-danger')} />
            {live.status === 'paused' ? 'Paused' : 'Live'}
          </span>
        )}
        <h1 className="truncate text-base font-semibold text-ink">{live.name}</h1>
        <span className="text-base text-faint">{fmtDay(live.startedAt ?? live.scheduledAt, b.timezone)}</span>
        <div className="ml-auto flex items-center gap-3">
          {running && (
            <>
              <span className="flex items-center gap-1.5">
                <Facepile items={faces} max={5} size={22} />
              </span>
              <span className="flex items-baseline gap-1.5 tabular-nums" data-testid="clock">
                <span className="text-base font-[600] text-ink">{fmtClock(totalElapsed)}</span>
                <span className={cn('text-xs', overall > 0 ? 'text-danger-text' : 'text-faint')}>/ {Math.round(plannedMs / 60000)} min</span>
              </span>
              <Tip label={live.paused ? 'Resume' : 'Pause'}>
                <Button size="icon" variant="ghost" aria-label={live.paused ? 'Resume' : 'Pause'} onClick={() => act({ k: live.paused ? 'resume' : 'pause' })}>
                  {live.paused ? <Play size={14} /> : <Pause size={14} />}
                </Button>
              </Tip>
              <Button onClick={() => setConfirmEnd(true)}>End meeting</Button>
            </>
          )}
          {live.status === 'scheduled' && <Button variant="primary" onClick={() => act({ k: 'start' })}>Start meeting</Button>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Agenda rail */}
        <aside className="flex w-[232px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line bg-canvas px-2.5 pb-4 pt-3" aria-label="Agenda">
          <div className="px-2 pb-2 text-xs font-[550] text-faint">Agenda · {Math.round(plannedMs / 60000)} min</div>
          {sections.map((s, i) => {
            const now_ = running && i === idx
            const past = running && i < idx
            const rem = remaining(i)
            const pct = Math.min(1, s.minutes ? sectionElapsed(i) / (s.minutes * 60_000) : 0)
            return (
              <button
                key={i}
                onClick={() => go(i)}
                disabled={!running}
                aria-current={now_ ? 'step' : undefined}
                data-testid={`rail-${i}`}
                className={cn(
                  'relative grid h-[34px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2.5 text-left text-base outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  now_ ? 'bg-surface font-[600] text-ink shadow-[0_0_0_1px_var(--m-line),0_1px_2px_rgb(16_24_40/0.05)]' : past ? 'text-ink hover:bg-nav-active' : 'text-nav hover:bg-nav-active',
                )}
              >
                <span className="grid place-items-center">
                  {past ? <Tick on size={14} /> : now_ ? <span className="size-2 rounded-full bg-accent" /> : <span className="size-2 rounded-full shadow-[inset_0_0_0_1.5px_var(--m-icon-faint)]" />}
                </span>
                <span className="truncate">{sectionLabel(s.term)}</span>
                <span className={cn('text-xs font-[500] tabular-nums', now_ ? (rem < 0 ? 'text-danger-text' : 'text-accent-text') : 'text-faint')}>
                  {now_ ? fmtClock(rem) : `${s.minutes} min`}
                </span>
                {now_ && (
                  <span className="absolute inset-x-2.5 bottom-[3px] h-0.5 overflow-hidden rounded-full bg-line-faint">
                    <span className={cn('block h-full', rem < 0 ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct * 100}%` }} />
                  </span>
                )}
              </button>
            )
          })}

          <div className="px-2 pb-1.5 pt-5 text-xs font-[550] text-faint">In the room</div>
          {live.attendees.map((a) => (
            <div key={a.id} className={cn('flex h-[30px] items-center gap-2.5 px-2.5 text-sm', a.present ? 'text-nav' : 'text-faint')}>
              <span className={cn('relative', !a.present && 'opacity-50')}>
                <Avatar name={a.name} size={18} />
                {a.present && <span className="absolute -bottom-px -right-px size-2 rounded-full bg-success shadow-[0_0_0_1.5px_var(--m-canvas)]" />}
              </span>
              <span className="truncate">{a.name}</span>
            </div>
          ))}
          {[...agentsIn.map((a) => ({ id: a.id, name: a.name, on: true })), ...scribeIn.map((a) => ({ id: a.id, name: a.name, on: false }))].map((a) => (
            <div key={a.id} className={cn('flex h-[30px] items-center gap-2.5 px-2.5 text-sm', a.on ? 'text-nav' : 'text-faint')}>
              <AgentMark size={18} className={cn(!a.on && 'opacity-50')} />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto text-xs text-faint">Notes</span>
            </div>
          ))}
          {running && (
            <div className="mt-auto flex items-center gap-1.5 px-2 pt-6 text-xs text-faint">
              <Kbd>←</Kbd><Kbd>→</Kbd> switch section
            </div>
          )}
        </aside>

        {/* Section content */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <div className="min-h-0 flex-1 overflow-auto" data-testid="section-body">
            <div className="mx-auto w-full max-w-[1100px] px-8 pb-10 pt-6" key={sections[idx]?.term}>
              {live.status === 'scheduled' ? (
                <ReadyToStart b={b} />
              ) : kind === 'checkin' ? (
                <CheckInView b={b} act={act} />
              ) : kind === 'scorecard' ? (
                <ScorecardView b={b} act={act} />
              ) : kind === 'priorities' ? (
                <PrioritiesView b={b} act={act} />
              ) : kind === 'headlines' ? (
                <HeadlinesView b={b} act={act} />
              ) : kind === 'todos' ? (
                <TodoReviewView b={b} act={act} today={b.today} />
              ) : kind === 'ids' ? (
                <IdsView b={b} act={act} today={b.today} />
              ) : kind === 'wrapup' ? (
                <WrapUpView b={b} act={act} onEnd={() => setConfirmEnd(true)} />
              ) : (
                <GenericView title={sectionLabel(sections[idx]?.term ?? '')} />
              )}
            </div>
          </div>
          {running && (
            <div className="flex h-11 shrink-0 items-center gap-2 border-t border-line px-4">
              <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => go(idx - 1)}><ChevronLeft size={14} /> {idx > 0 ? sectionLabel(sections[idx - 1]!.term) : 'Previous'}</Button>
              <span className="mx-auto text-xs tabular-nums text-faint">Section {idx + 1} of {sections.length}</span>
              <Button size="sm" variant={idx < sections.length - 1 ? 'primary' : 'secondary'} disabled={idx >= sections.length - 1} onClick={() => go(idx + 1)} data-testid="next-section">
                {idx < sections.length - 1 ? `Next: ${sectionLabel(sections[idx + 1]!.term)}` : 'Last section'} <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </main>
      </div>

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End {live.name}?</DialogTitle>
            <DialogDescription>
              {live.ratings.count} of {live.attendees.length} ratings in. Pending {L('todo').toLowerCase()}s become done, the summary is saved
              {live.settings.sendRecap ? ' and the recap is sent' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmEnd(false)}>Keep going</Button>
            <Button variant="primary" loading={ending} onClick={endNow} data-testid="confirm-end">End meeting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReadyToStart({ b }: { b: Bundle }) {
  const { live } = b
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h2 className="text-lg font-[640] tracking-tight text-ink">Ready when you are</h2>
      <p className="mt-1 text-base text-body">
        {live.agenda.length} sections · {live.agenda.reduce((n, a) => n + a.minutes, 0)} min · {live.attendees.length} invited
      </p>
      <p className="mt-4 text-sm text-faint">Start the meeting to begin the clock. The agenda on the left becomes your navigation, and everyone who opens this page joins automatically.</p>
    </div>
  )
}
