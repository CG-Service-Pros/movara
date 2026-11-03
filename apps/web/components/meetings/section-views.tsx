'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, Check, ChevronDown, Mail, Megaphone, Trash2 } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { Input } from '@movara/ui/input'
import { Meter } from '@movara/ui/meter'
import { StatusGlyph } from '@movara/ui/status-glyph'
import { Switch } from '@movara/ui/switch'
import { toast } from '@movara/ui/toaster'
import { fmtDate } from './format'
import { Captured, Empty, Hint, List, Owner, SectionTitle, Tick, type Act } from './parts'
import type { Bundle } from './types'

const hasIssueFrom = (b: Bundle, type: string, id: string) => b.issues.some((i) => i.source?.type === type && i.source.id === id && i.status === 'open')

/** "Drop to issues" -> core meeting.drop_to_issue; flips to "In issues" once the issue exists. */
function DropButton({ b, act, type, id, emphasis }: { b: Bundle; act: Act; type: 'metric' | 'priority' | 'headline' | 'todo'; id: string; emphasis?: boolean }) {
  const [busy, setBusy] = useState(false)
  const done = hasIssueFrom(b, type, id)
  const issues = b.labels.issue?.p ?? 'issues'
  if (done) {
    return (
      <span className="inline-flex h-6 items-center gap-1 px-2 text-xs font-[550] text-success-text">
        <Check size={13} strokeWidth={2.4} /> In {issues.toLowerCase()}
      </span>
    )
  }
  return (
    <Button
      size="sm"
      variant={emphasis ? 'secondary' : 'ghost'}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        const r = await act({ k: 'drop', type, id })
        setBusy(false)
        if (r.ok) toast.success(`Added to ${issues.toLowerCase()}`)
      }}
    >
      <ArrowDownToLine size={13} /> Drop to {issues.toLowerCase()}
    </Button>
  )
}

// ------------------------------------------------------------------ check-in

export function CheckInView({ b, act }: { b: Bundle; act: Act }) {
  // Who has shared is part of the live meeting state (core `meeting.set_shared`), so the whole room sees it.
  const att = b.live.attendees
  const shared = b.live.sharedIds.filter((id) => att.some((a) => a.id === id))
  const toggle = (id: string) => {
    const on = !b.live.sharedIds.includes(id)
    void act({ k: 'shared', personId: id, shared: on }, (x) => ({ ...x, live: { ...x.live, sharedIds: on ? [...x.live.sharedIds, id] : x.live.sharedIds.filter((s) => s !== id) } }))
  }
  return (
    <>
      <SectionTitle aside={<span className="text-sm text-body tabular-nums">{shared.length} of {att.length} shared</span>}>{b.labels.check_in?.s}</SectionTitle>
      <Hint>Go around the room. One personal and one professional best from the week.</Hint>
      <List>
        {att.map((a) => (
          <div key={a.id} className="flex h-11 items-center gap-3 px-4">
            <Owner b={b} id={a.id} size={22} />
            <span className={cn('text-xs', a.present ? 'text-success-text' : 'text-faint')}>{a.present ? 'In the room' : 'Not joined'}</span>
            <Button className="ml-auto" size="sm" variant={shared.includes(a.id) ? 'secondary' : 'ghost'} onClick={() => toggle(a.id)} aria-pressed={shared.includes(a.id)}>
              {shared.includes(a.id) ? <><Check size={13} strokeWidth={2.4} className="text-success" /> Shared</> : 'Mark shared'}
            </Button>
          </div>
        ))}
        {b.scribe && (
          <div className="flex h-11 items-center gap-3 bg-canvas/50 px-4">
            <AgentMark size={22} />
            <span className="text-sm text-body">{b.scribe.name}</span>
            <span className="text-xs text-faint">{b.scribe.online ? 'Taking notes' : 'Note-taker, not connected'}</span>
          </div>
        )}
      </List>
    </>
  )
}

// ------------------------------------------------------------------ scorecard

export function ScorecardView({ b, act }: { b: Bundle; act: Act }) {
  const sc = b.scorecard
  return (
    <>
      <SectionTitle
        aside={
          sc && (
            <span className="flex items-center gap-2 text-sm tabular-nums text-body">
              <span className="text-success-text">{sc.onTrack} on track</span>
              <span>·</span>
              <span className={sc.offTrack ? 'text-danger-text' : ''}>{sc.offTrack} off track</span>
              {sc.missing > 0 && <><span>·</span><span>{sc.missing} missing</span></>}
            </span>
          )
        }
      >
        {b.labels.metric_review?.s}
      </SectionTitle>
      <Hint>Latest period. Anything off track that needs discussion goes to {b.labels.issue?.p.toLowerCase() ?? 'issues'}; everything else is reported and moved on.</Hint>
      {!sc || sc.metrics.length === 0 ? (
        <Empty>No {b.labels.metric?.p.toLowerCase()} on this team's {b.labels.scorecard?.s.toLowerCase()} yet.</Empty>
      ) : (
        <List>
          {sc.metrics.map((m) => (
            <div key={m.id} className={cn('group grid min-h-12 grid-cols-[18px_minmax(0,1fr)_auto_auto_auto] items-center gap-4 px-4 py-1.5', m.status === 'off' && 'bg-danger-soft/40')}>
              {m.status === 'missing' ? <span className="size-3.5 rounded-full border-[1.5px] border-dashed border-icon" title="Missing" /> : <StatusGlyph status={m.status} />}
              <div className="min-w-0">
                <div className="truncate text-base font-[500] text-ink">{m.title}</div>
                <div className="text-xs text-faint"><Owner b={b} id={m.ownerIds[0]} size={14} muted /></div>
              </div>
              <div className="w-20 text-right text-xs text-faint tabular-nums">{m.previousLabel ? `prev ${m.previousLabel}` : ''}</div>
              <div className="w-28 text-right">
                <div className={cn('text-base font-[600] tabular-nums', m.status === 'off' ? 'text-danger-text' : m.status === 'missing' ? 'text-faint' : 'text-ink')}>{m.valueLabel ?? 'Missing'}</div>
                <div className="text-xs text-faint tabular-nums">goal {m.goalLabel}</div>
              </div>
              <div className={cn(m.status !== 'off' && !hasIssueFrom(b, 'metric', m.id) && 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100')}>
                <DropButton b={b} act={act} type="metric" id={m.id} emphasis={m.status === 'off'} />
              </div>
            </div>
          ))}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ priorities

const PRIORITY_STATUSES = ['on_track', 'off_track', 'done', 'not_done', 'dropped'] as const

export function PrioritiesView({ b, act }: { b: Bundle; act: Act }) {
  const label = (s: string) => b.statusLabels[s] ?? s
  const tone = (s: string) => (s === 'on_track' ? 'success' : s === 'off_track' || s === 'not_done' ? 'danger' : 'neutral') as 'success' | 'danger' | 'neutral'
  const off = b.priorities.filter((p) => p.status === 'off_track').length
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{b.priorities.length - off} on track · {off} off track</span>}>{b.labels.priority_review?.s}</SectionTitle>
      <Hint>Each owner says on track or off track. Off track goes to {b.labels.issue?.p.toLowerCase()}.</Hint>
      {b.priorities.length === 0 ? (
        <Empty>No {b.labels.priority?.p.toLowerCase()} for this team this quarter.</Empty>
      ) : (
        <List>
          {b.priorities.map((p) => (
            <div key={p.id} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 px-4 py-1.5">
              <div className="min-w-0">
                <div className="truncate text-base font-[500] text-ink">{p.title}</div>
                <div className="text-xs"><Owner b={b} id={p.ownerId} size={14} muted /></div>
              </div>
              <div className="flex w-28 items-center gap-2 text-xs text-faint tabular-nums">
                <Meter value={p.milestonesTotal ? p.milestonesDone / p.milestonesTotal : 0} tone={p.status === 'off_track' ? 'danger' : 'success'} className="w-14" />
                {p.milestonesDone}/{p.milestonesTotal}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex" aria-label={`Status: ${label(p.status)}`}>
                    <Badge tone={tone(p.status)} className="h-6 cursor-pointer gap-1.5 pl-2.5 pr-1.5">
                      {label(p.status)} <ChevronDown size={12} />
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {PRIORITY_STATUSES.map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => act({ k: 'priority_status', id: p.id, status: s }, (x) => ({ ...x, priorities: x.priorities.map((y) => (y.id === p.id ? { ...y, status: s } : y)) }))}>
                      {label(s)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropButton b={b} act={act} type="priority" id={p.id} emphasis={p.status === 'off_track'} />
            </div>
          ))}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ headlines

export function HeadlinesView({ b, act }: { b: Bundle; act: Act }) {
  const reviewed = b.headlines.filter((h) => h.reviewed).length
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{reviewed} of {b.headlines.length} reviewed</span>}>{b.labels.headline_review?.s}</SectionTitle>
      <Hint>Customer and employee news, good and bad. Read it, mark it reviewed, drop anything that needs work.</Hint>
      {b.headlines.length === 0 ? (
        <Empty>No {b.labels.headline?.p.toLowerCase()} to review.</Empty>
      ) : (
        <List>
          {b.headlines.map((h) => (
            <div key={h.id} className="group flex items-start gap-3 px-4 py-3">
              <button
                aria-label={h.reviewed ? 'Reviewed' : 'Mark reviewed'}
                disabled={h.reviewed}
                onClick={() => act({ k: 'review_headline', id: h.id }, (x) => ({ ...x, headlines: x.headlines.map((y) => (y.id === h.id ? { ...y, reviewed: true } : y)) }))}
                className="mt-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <Tick on={h.reviewed} />
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn('text-base text-ink', h.reviewed && 'text-body')}>{h.text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-faint">
                  <Badge className="capitalize">{h.kind}</Badge>
                  <Owner b={b} id={h.ownerId} size={14} muted />
                  <Captured by={h.createdBy} verb="Posted" />
                </div>
              </div>
              <div className={cn(!hasIssueFrom(b, 'headline', h.id) && 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100')}>
                <DropButton b={b} act={act} type="headline" id={h.id} />
              </div>
            </div>
          ))}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ to-do review

export function TodoReviewView({ b, act, today }: { b: Bundle; act: Act; today: string }) {
  const [notDone, setNotDone] = useState<string[]>([])
  const mine = b.todos.filter((t) => !b.live.newTodoIds.includes(t.id))
  const done = mine.filter((t) => t.status === 'pending').length
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{done} of {mine.length} done</span>}>{b.labels.todo_review?.s}</SectionTitle>
      <Hint>Last week's {b.labels.todo?.p.toLowerCase()}. Done is confirmed when the meeting ends. Anything not done can go to {b.labels.issue?.p.toLowerCase()}.</Hint>
      {mine.length === 0 ? (
        <Empty>No open {b.labels.todo?.p.toLowerCase()} for this team.</Empty>
      ) : (
        <List>
          {mine.map((t) => {
            const overdue = !!t.dueDate && t.dueDate < today
            const isDone = t.status === 'pending'
            const isNot = !isDone && notDone.includes(t.id)
            return (
              <div key={t.id} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-base text-ink', isDone && 'text-body line-through decoration-faint')}>{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-faint">
                    <Owner b={b} id={t.ownerId} size={14} muted />
                    {t.dueDate && <span className={cn(overdue && !isDone && 'font-[550] text-danger-text')}>{overdue && !isDone ? 'Overdue · ' : 'Due '}{fmtDate(t.dueDate)}</span>}
                    <Captured by={t.createdBy} />
                  </div>
                </div>
                {isNot && <DropButton b={b} act={act} type="todo" id={t.id} />}
                <div className="inline-flex gap-0.5 rounded-md bg-canvas p-0.5" role="group" aria-label="Outcome">
                  <button
                    onClick={() => {
                      setNotDone((n) => n.filter((x) => x !== t.id))
                      act({ k: 'todo', id: t.id, done: true }, (x) => ({ ...x, todos: x.todos.map((y) => (y.id === t.id ? { ...y, status: 'pending' } : y)) }))
                    }}
                    aria-pressed={isDone}
                    className={cn('h-6 rounded-sm px-2.5 text-sm font-[500] outline-none focus-visible:ring-2 focus-visible:ring-accent/50', isDone ? 'bg-success text-white' : 'text-body hover:text-ink')}
                  >
                    Done
                  </button>
                  <button
                    onClick={() => {
                      setNotDone((n) => (n.includes(t.id) ? n : [...n, t.id]))
                      if (isDone) act({ k: 'todo', id: t.id, done: false }, (x) => ({ ...x, todos: x.todos.map((y) => (y.id === t.id ? { ...y, status: 'open' } : y)) }))
                    }}
                    aria-pressed={isNot}
                    className={cn('h-6 rounded-sm px-2.5 text-sm font-[500] outline-none focus-visible:ring-2 focus-visible:ring-accent/50', isNot ? 'bg-danger text-white' : 'text-body hover:text-ink')}
                  >
                    Not done
                  </button>
                </div>
              </div>
            )
          })}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ generic

export function GenericView({ title }: { title: string }) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Empty>Free discussion. Capture anything that needs work as an issue or a to-do in the next steps.</Empty>
    </>
  )
}

// ------------------------------------------------------------------ wrap-up

export function WrapUpView({ b, act, onEnd }: { b: Bundle; act: Act; onEnd: () => void }) {
  const { live } = b
  const newTodos = b.todos.filter((t) => live.newTodoIds.includes(t.id))
  const solved = live.ids.solvedIssueIds.length
  const discussed = live.ids.discussedIssueIds.length
  const [text, setText] = useState('')
  const [teams, setTeams] = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [sent, setSent] = useState<string[]>([])
  const mine = live.ratings.mine
  const rated = live.attendees.filter((a) => a.rated).length
  return (
    <>
      <SectionTitle>{b.labels.wrap_up?.s}</SectionTitle>
      <Hint>Recap what was decided, share one message with the company, then rate the meeting.</Hint>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-[600] text-ink">New {b.labels.todo?.p.toLowerCase()}</h3>
            <span className="text-xs tabular-nums text-faint">{newTodos.length} · {solved} of {discussed} {b.labels.issue?.p.toLowerCase()} solved</span>
          </div>
          {newTodos.length === 0 ? (
            <p className="mt-3 text-sm text-faint">Nothing captured in this meeting yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-faint">
              {newTodos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <Tick on={false} size={14} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{t.title}</div>
                    <Captured by={t.createdBy} />
                  </div>
                  <Owner b={b} id={t.ownerId} size={18} />
                  <span className="w-12 text-right text-xs text-faint">{fmtDate(t.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
          <h3 className="flex items-center gap-1.5 text-sm font-[600] text-ink"><Megaphone size={14} className="text-icon" /> Cascading {b.labels.headline?.s.toLowerCase()}</h3>
          <p className="mt-1 text-xs text-faint">A message to pass on to other teams.</p>
          <Input className="mt-3" placeholder="What should the rest of the company hear?" value={text} onChange={(e) => setText(e.target.value)} aria-label="Cascading headline" />
          {b.otherTeams.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.otherTeams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTeams((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))}
                  aria-pressed={teams.includes(t.id)}
                  className={cn('h-6 rounded-full px-2.5 text-xs font-[550] outline-none focus-visible:ring-2 focus-visible:ring-accent/50', teams.includes(t.id) ? 'bg-accent-soft text-accent-text' : 'bg-canvas text-body hover:text-ink')}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <Button
            className="mt-3"
            size="sm"
            disabled={!text.trim()}
            loading={posting}
            onClick={async () => {
              setPosting(true)
              const r = await act({ k: 'cascade', text: text.trim(), teamIds: teams })
              setPosting(false)
              if (r.ok) {
                setSent((s) => [...s, text.trim()])
                setText('')
                setTeams([])
                toast.success('Headline cascaded')
              }
            }}
          >
            Send
          </Button>
          {sent.map((s) => (
            <div key={s} className="mt-2 flex items-center gap-1.5 text-xs text-success-text"><Check size={12} strokeWidth={2.4} /> <span className="truncate text-body">{s}</span></div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-[600] text-ink">Rate this meeting</h3>
          <span className="text-xs tabular-nums text-faint">{rated} of {live.attendees.length} rated{live.ratings.average !== null ? ` · average ${live.ratings.average}` : ''}</span>
        </div>
        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Rating, 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={mine === n}
              onClick={() => act({ k: 'rate', score: n }, (x) => ({ ...x, live: { ...x.live, ratings: { ...x.live.ratings, mine: n }, attendees: x.live.attendees.map((a) => (a.id === x.me?.id ? { ...a, rated: true } : a)) } }))}
              className={cn(
                'h-9 flex-1 rounded-md text-base font-[600] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50',
                mine === n ? 'bg-accent text-white' : 'bg-canvas text-body hover:bg-nav-active hover:text-ink',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-faint"><span>Poor</span><span>Great</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <Switch
            checked={live.settings.clearItems}
            onCheckedChange={(v) => act({ k: 'settings', clearItems: v }, (x) => ({ ...x, live: { ...x.live, settings: { ...x.live.settings, clearItems: v } } }))}
          />
          <Trash2 size={14} className="text-icon" /> Clear done {b.labels.todo?.p.toLowerCase()} and reviewed {b.labels.headline?.p.toLowerCase()}
        </label>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <Switch
            checked={live.settings.sendRecap}
            onCheckedChange={(v) => act({ k: 'settings', sendRecap: v }, (x) => ({ ...x, live: { ...x.live, settings: { ...x.live.settings, sendRecap: v } } }))}
          />
          <Mail size={14} className="text-icon" /> Send recap to attendees
        </label>
        <Button className="ml-auto" variant="primary" onClick={onEnd}>End meeting</Button>
      </div>
      {!mine && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-faint"><AlertTriangle size={12} /> You have not rated yet.</p>
      )}
    </>
  )
}
