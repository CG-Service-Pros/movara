'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { AgentMark } from '@motion/ui/agent-mark'
import { Button } from '@motion/ui/button'
import { cn } from '@motion/ui/cn'
import { Input } from '@motion/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@motion/ui/select'
import { Textarea } from '@motion/ui/textarea'
import { toast } from '@motion/ui/toaster'
import { fmtDate } from './format'
import { Captured, Hint, Owner, SectionTitle, Tick, type Act } from './parts'
import type { BIssue, Bundle } from './types'

type Step = 'identify' | 'discuss' | 'solve'

function Stepper({ b, step, onStep, enabled }: { b: Bundle; step: Step; onStep: (s: Step) => void; enabled: boolean }) {
  const order: Step[] = ['identify', 'discuss', 'solve']
  const at = order.indexOf(step)
  return (
    <div className="ml-auto flex gap-1 rounded-md bg-canvas p-0.5" role="tablist" aria-label="Issue solving step">
      {order.map((s, i) => (
        <button
          key={s}
          role="tab"
          aria-selected={s === step}
          disabled={!enabled && s !== 'identify'}
          onClick={() => onStep(s)}
          className={cn(
            'h-[22px] rounded-sm px-2.5 text-xs font-[550] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50',
            s === step ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--m-line),0_1px_2px_rgb(16_24_40/0.06)]' : i < at ? 'text-body' : 'text-faint',
          )}
        >
          {b.labels[s]?.s ?? s}
        </button>
      ))}
    </div>
  )
}

export function IdsView({ b, act, today }: { b: Bundle; act: Act; today: string }) {
  const { live } = b
  const ids = live.ids
  const max = live.settings.focusIssueCount
  const byId = new Map(b.issues.map((i) => [i.id, i]))
  const picks = ids.focusIssueIds.filter((i) => !ids.discussedIssueIds.includes(i))
  const current = ids.currentIssueId ? (byId.get(ids.currentIssueId) ?? null) : null
  const focusTotal = ids.focusIssueIds.length
  const [step, setStep] = useState<Step>('discuss')
  const lastCurrent = useRef<string | null>(null)
  useEffect(() => {
    if (ids.currentIssueId !== lastCurrent.current) {
      lastCurrent.current = ids.currentIssueId
      setStep(ids.currentIssueId ? 'discuss' : 'identify')
    }
  }, [ids.currentIssueId])
  const shownStep: Step = current ? step : 'identify'

  const setPicks = (next: string[]) =>
    act({ k: 'focus', issueIds: next }, (x) => {
      const focus = [...x.live.ids.focusIssueIds.filter((i) => x.live.ids.discussedIssueIds.includes(i)), ...next]
      const cur = x.live.ids.currentIssueId && next.includes(x.live.ids.currentIssueId) ? x.live.ids.currentIssueId : null
      return { ...x, live: { ...x.live, ids: { ...x.live.ids, focusIssueIds: focus, currentIssueId: cur, status: cur ? 'discussing' : next.length ? 'prioritizing' : x.live.ids.status } } }
    })
  const togglePick = (id: string) => {
    if (picks.includes(id)) return setPicks(picks.filter((p) => p !== id))
    if (picks.length >= max) return toast.error(`Pick up to ${max} ${b.labels.issue?.p.toLowerCase()} to discuss`)
    return setPicks([...picks, id])
  }
  const startDiscussing = (issueId?: string) =>
    act({ k: 'ids_start', issueId: issueId ?? picks[0]! }, (x) => ({ ...x, live: { ...x.live, ids: { ...x.live.ids, currentIssueId: issueId ?? picks[0]!, status: 'discussing' } } }))

  const resolve = (issue: BIssue, solved: boolean) =>
    act({ k: 'resolve', issueId: issue.id, solved }, (x) => {
      const d = [...x.live.ids.discussedIssueIds, issue.id]
      const next = x.live.ids.focusIssueIds.find((i) => !d.includes(i)) ?? null
      return {
        ...x,
        live: { ...x.live, ids: { ...x.live.ids, discussedIssueIds: d, solvedIssueIds: solved ? [...x.live.ids.solvedIssueIds, issue.id] : x.live.ids.solvedIssueIds, currentIssueId: next, status: next ? 'discussing' : 'complete' } },
      }
    })

  const solvedCount = ids.solvedIssueIds.length
  const allDone = focusTotal > 0 && picks.length === 0
  const focusIssues = ids.focusIssueIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []))
  const queue = b.issues.filter((i) => i.status === 'open' && !ids.focusIssueIds.includes(i.id)).sort((a, c) => a.rank - c.rank)
  const [showAll, setShowAll] = useState(false)
  const queueShown = showAll ? queue : queue.slice(0, 6)

  return (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-[18px] font-[640] tracking-[-0.02em] text-ink">{b.labels.issue_solving?.s}</h2>
        <span className="text-sm font-[500] tabular-nums text-body" data-testid="solved-count">
          {solvedCount} of {focusTotal || max} solved
        </span>
        <Stepper b={b} step={shownStep} onStep={setStep} enabled={!!current} />
      </div>

      {current ? (
        <FocusCard key={current.id} b={b} act={act} issue={current} step={shownStep} setStep={setStep} today={today} onResolve={(s) => resolve(current, s)} />
      ) : (
        <section className="mt-4 rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--m-line),0_2px_6px_rgb(16_24_40/0.04)]">
          {allDone ? (
            <>
              <div className="flex items-center gap-2 text-base font-[600] text-ink"><Tick on size={18} /> All {focusTotal} {b.labels.issue?.p.toLowerCase()} discussed</div>
              <p className="mt-1 text-sm text-body">{solvedCount} solved. Pick more from the list below, or move on to the wrap-up with →.</p>
            </>
          ) : (
            <>
              <div className="text-base font-[600] text-ink">{b.labels.identify?.s}: pick up to {max} {b.labels.issue?.p.toLowerCase()} to work on</div>
              <Hint>Choose the ones that matter most this week. The numbers show the order you will take them in.</Hint>
              <div className="mt-4 flex items-center gap-3">
                <Button variant="primary" disabled={picks.length === 0} onClick={() => startDiscussing()}>
                  Start discussing <ArrowRight size={14} />
                </Button>
                <span className="text-sm tabular-nums text-faint">{picks.length} of {max} picked</span>
              </div>
            </>
          )}
        </section>
      )}

      <div className="mt-5">
        {focusIssues.length > 0 && (
          <div className="flex flex-col" data-testid="ids-queue">
            {focusIssues.map((i, n) => {
              const solved = ids.solvedIssueIds.includes(i.id)
              const discussed = ids.discussedIssueIds.includes(i.id)
              const now = i.id === ids.currentIssueId
              return (
                <div key={i.id} className={cn('grid h-10 grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-3 text-base', now ? 'bg-accent-soft' : n > 0 && 'shadow-[inset_0_1px_0_var(--m-line-faint)]')}>
                  <span className="grid size-5 place-items-center rounded-md bg-canvas text-2xs font-[600] text-body tabular-nums">{n + 1}</span>
                  <span className={cn('truncate text-ink', discussed && 'text-body line-through decoration-faint')}>{i.title}</span>
                  <span className="flex items-center gap-2">
                    {!discussed && !now && current && (
                      <Button size="sm" variant="ghost" onClick={() => startDiscussing(i.id)}>Discuss now</Button>
                    )}
                    {!discussed && !current && (
                      <Button size="sm" variant="ghost" onClick={() => togglePick(i.id)}>Remove</Button>
                    )}
                    {discussed && !solved && <span className="text-xs text-faint">Not solved</span>}
                    <Owner b={b} id={i.ownerId} size={18} />
                  </span>
                  {discussed ? <Tick on={solved} /> : <span className="size-4" />}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between px-3 text-xs font-[550] text-faint">
          <span>{b.labels.issues_list?.s} · {queue.length} open</span>
          {focusTotal === 0 && <span>Click to pick</span>}
        </div>
        <div className="mt-1 flex flex-col">
          {queue.length === 0 && <div className="px-3 py-6 text-sm text-faint">No other open {b.labels.issue?.p.toLowerCase()}.</div>}
          {queueShown.map((i, n) => (
            <div key={i.id} className={cn('group grid h-10 grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-3 text-base hover:bg-canvas', n > 0 && 'shadow-[inset_0_1px_0_var(--m-line-faint)]')}>
              <span className="grid size-5 place-items-center rounded-md text-2xs font-[600] text-faint tabular-nums">{focusIssues.length + n + 1}</span>
              <span className="truncate text-ink">{i.title}</span>
              <span className="hidden max-w-56 truncate text-xs text-faint md:block">{i.sourceLabel}</span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => togglePick(i.id)}>
                  Pick
                </Button>
                <Owner b={b} id={i.ownerId} size={18} />
              </span>
            </div>
          ))}
          {queue.length > 6 && (
            <button className="px-3 py-2 text-left text-xs font-[550] text-accent-text outline-none hover:underline" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show ${queue.length - 6} more`}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function FocusCard({ b, act, issue, step, setStep, today, onResolve }: { b: Bundle; act: Act; issue: BIssue; step: Step; setStep: (s: Step) => void; today: string; onResolve: (solved: boolean) => void }) {
  const [notes, setNotes] = useState(issue.description ?? '')
  const saved = useRef(issue.description ?? '')
  useEffect(() => {
    // Take notes written elsewhere (an agent, another browser) unless the user is typing.
    if (document.activeElement?.tagName !== 'TEXTAREA' && (issue.description ?? '') !== saved.current) {
      saved.current = issue.description ?? ''
      setNotes(saved.current)
    }
  }, [issue.description])
  const todos = b.todos.filter((t) => t.source?.type === 'issue' && t.source.id === issue.id)
  const agentTodo = todos.find((t) => t.createdBy?.type === 'agent')
  const allAgent = todos.length > 0 && todos.every((t) => t.createdBy?.type === 'agent' && t.createdBy.name === agentTodo?.createdBy?.name)
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(issue.ownerId ?? b.me?.id ?? '')
  const [due, setDue] = useState('')
  const [adding, setAdding] = useState(false)
  const people = b.live.attendees.length ? b.live.attendees : b.people

  const add = async () => {
    if (!title.trim() || !owner) return
    setAdding(true)
    const r = await act({ k: 'capture_todo', issueId: issue.id, title: title.trim(), ownerId: owner, dueDate: due || undefined })
    setAdding(false)
    if (r.ok) {
      setTitle('')
      setDue('')
    }
  }
  const hints: Record<Step, string> = { identify: 'Name the real issue in a sentence.', discuss: 'Everyone weighs in. Take notes.', solve: 'Agree on next steps and capture them as to-dos.' }

  return (
    <section className="mt-4 rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--m-line),0_2px_6px_rgb(16_24_40/0.04)]" data-testid="focus-card">
      <div className="flex items-center gap-2 text-xs text-body">
        <Owner b={b} id={issue.ownerId} size={18} />
        {issue.sourceLabel && <span className="ml-auto truncate rounded-md bg-canvas px-2 py-0.5 text-xs">{issue.sourceLabel}</span>}
      </div>
      <h3 className="mt-3 text-lg font-[620] tracking-[-0.015em] text-ink">{issue.title}</h3>
      <p className="mt-1 text-xs text-faint">{hints[step]}</p>

      <Textarea
        className="mt-3"
        rows={3}
        placeholder="Notes from the discussion"
        aria-label="Discussion notes"
        value={notes}
        onFocus={() => step === 'identify' && setStep('discuss')}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== saved.current) {
            saved.current = notes
            act({ k: 'notes', issueId: issue.id, description: notes })
          }
        }}
      />

      <div className="mt-3 rounded-lg bg-canvas p-3">
        <div className="flex items-center gap-2 text-xs font-[550] text-body">
          {allAgent ? (
            <>
              <AgentMark size={16} /> Captured by {agentTodo!.createdBy!.name}
            </>
          ) : (
            <>To-dos from this {b.labels.issue?.s.toLowerCase()}</>
          )}
          <span className="ml-auto tabular-nums text-faint">{todos.length}</span>
        </div>
        {todos.map((t) => (
          <div key={t.id} className="mt-2 grid grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2.5 text-base text-ink">
            <Tick on={false} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{t.title}</span>
              {t.createdBy?.type === 'agent' && !allAgent && <Captured by={t.createdBy} />}
            </span>
            <Owner b={b} id={t.ownerId} size={18} />
            <span className="w-14 text-right text-xs text-body">{fmtDate(t.dueDate)}</span>
          </div>
        ))}
        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => step !== 'solve' && setStep('solve')} placeholder="Add a to-do" aria-label="New to-do title" className="flex-1" />
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-36" aria-label="Owner">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="w-36" />
          <Button type="submit" loading={adding} disabled={!title.trim() || !owner} aria-label="Add to-do"><Plus size={14} /> Add</Button>
        </form>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => onResolve(false)}>Not solved</Button>
        <Button variant="primary" onClick={() => onResolve(true)}>
          <Check size={14} strokeWidth={2.4} /> Mark solved
        </Button>
      </div>
    </section>
  )
}
