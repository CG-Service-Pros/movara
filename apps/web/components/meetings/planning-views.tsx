'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, ArrowDownRight, ArrowUpRight, Check, Minus, Plus } from 'lucide-react'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { Input } from '@movara/ui/input'
import { Meter } from '@movara/ui/meter'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Switch } from '@movara/ui/switch'
import { toast } from '@movara/ui/toaster'
import { fmtDate } from './format'
import { Empty, Hint, List, Owner, SectionTitle, Tick, type Act } from './parts'
import type { Bundle } from './types'

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 10) / 10 : null)

/** 1-10 buttons. `value` null = not set; clicking the selected number clears it. */
function ScoreButtons({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'h-8 w-8 rounded-md text-sm font-[600] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50',
            value === n ? 'bg-accent text-white' : 'bg-canvas text-body hover:bg-nav-active hover:text-ink',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

const people = (b: Bundle) => (b.live.attendees.length ? b.live.attendees : b.people)

function OwnerSelect({ b, value, onChange, label = 'Owner', className }: { b: Bundle; value: string; onChange: (v: string) => void; label?: string; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-40', className)} aria-label={label}><SelectValue placeholder="Owner" /></SelectTrigger>
      <SelectContent>{people(b).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
    </Select>
  )
}

// ------------------------------------------------------------------ quarter review

const STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = { done: 'success', not_done: 'danger', off_track: 'danger', on_track: 'neutral', dropped: 'neutral' }

export function QuarterReviewView({ b, act }: { b: Bundle; act: Act }) {
  const q = b.quarterReview
  const grades = b.live.quarterGrades
  const gradeAvg = avg(Object.values(grades))
  const att = people(b)
  const setGrade = (personId: string, score: number | null) =>
    void act({ k: 'quarter_grade', personId, score }, (x) => {
      const next = { ...x.live.quarterGrades }
      if (score === null) delete next[personId]
      else next[personId] = score
      return { ...x, live: { ...x.live, quarterGrades: next } }
    })
  const label = (s: string) => b.statusLabels[s] ?? s
  return (
    <>
      <SectionTitle aside={q && <span className="text-sm tabular-nums text-body">{q.quarter}</span>}>{b.labels.quarter_review?.s}</SectionTitle>
      <Hint>How did the quarter go? {b.labels.priority?.p} finished, the {b.labels.scorecard?.s.toLowerCase()} trend, and a grade from everyone.</Hint>

      {!q || q.priorities.length === 0 ? (
        <Empty>No {b.labels.priority?.p.toLowerCase()} were set for {q?.quarter ?? 'that quarter'}.</Empty>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]">
            <div className="flex items-center gap-4 border-b border-line-faint px-4 py-3">
              <h3 className="text-sm font-[600] text-ink">{b.labels.priority?.p}</h3>
              <span className="text-sm tabular-nums text-success-text" data-testid="qr-done">{q.done} done</span>
              <span className={cn('text-sm tabular-nums', q.notDone ? 'text-danger-text' : 'text-body')} data-testid="qr-notdone">{q.notDone} not done</span>
              {q.dropped > 0 && <span className="text-sm tabular-nums text-faint">{q.dropped} dropped</span>}
            </div>
            <div className="divide-y divide-line-faint">
              {q.priorities.map((p) => (
                <div key={p.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                  <Tick on={p.status === 'done'} size={16} />
                  <span className={cn('min-w-0 flex-1 truncate text-base', p.status === 'dropped' ? 'text-faint line-through' : 'text-ink')}>{p.title}</span>
                  <Owner b={b} id={p.ownerId} size={16} muted />
                  <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{label(p.status)}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
            <h3 className="text-sm font-[600] text-ink">Completion by person</h3>
            <div className="mt-3 flex flex-col gap-3">
              {q.byPerson.map((r) => (
                <div key={r.personId ?? 'none'} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-center gap-3">
                  <Owner b={b} id={r.personId} size={18} />
                  <Meter className="w-full" value={r.pct / 100} tone={r.pct >= 70 ? 'success' : 'danger'} />
                  <span className="w-20 text-right text-sm tabular-nums text-body">{r.pct}% · {r.done}/{r.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-[600] text-ink">{b.labels.scorecard?.s} trend</h3>
          {q?.scorecard?.onTrackPct != null && <span className="text-sm tabular-nums text-body">{q.scorecard.onTrackPct}% of recorded weeks on track</span>}
        </div>
        {!q?.scorecard || q.scorecard.recorded === 0 ? (
          <p className="mt-2 text-sm text-faint">No {b.labels.metric?.p.toLowerCase()} were recorded in {q?.quarter ?? 'that quarter'}.</p>
        ) : (
          <div className="mt-2 divide-y divide-line-faint">
            {q.scorecard.metrics.filter((m) => m.recorded > 0).map((m) => {
              const pct = Math.round((m.onTrack / m.recorded) * 100)
              const Trend = m.trend === 'up' ? ArrowUpRight : m.trend === 'down' ? ArrowDownRight : Minus
              return (
                <div key={m.id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_96px_auto] items-center gap-4 py-1">
                  <span className="truncate text-base text-ink">{m.title}</span>
                  <span className="flex items-center gap-1.5 text-sm tabular-nums text-body"><Trend size={14} className={m.trend === 'up' ? 'text-success' : m.trend === 'down' ? 'text-danger' : 'text-faint'} /> {m.first ?? '–'} → {m.last ?? '–'}</span>
                  <Meter className="w-full" value={pct / 100} tone={pct >= 70 ? 'success' : 'danger'} />
                  <span className="w-24 text-right text-sm tabular-nums text-body">{m.onTrack}/{m.recorded} on track</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-[600] text-ink">Grade the quarter</h3>
          <span className="text-xs tabular-nums text-faint">{Object.keys(grades).length} of {att.length} graded{gradeAvg !== null ? ` · average ${gradeAvg}` : ''}</span>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {att.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="w-40"><Owner b={b} id={p.id} size={20} /></span>
              <ScoreButtons value={grades[p.id] ?? null} label={`Quarter grade for ${p.name}`} onChange={(v) => setGrade(p.id, v)} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">1 is a poor quarter, 10 a great one. Click a selected number to clear it.</p>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ vision review

export function VisionReviewView({ b, act, slug, term }: { b: Bundle; act: Act; slug: string; term: string }) {
  const v = b.visionReview
  const [added, setAdded] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const issueWord = b.labels.issue?.p.toLowerCase() ?? 'issues'
  const sections = v ? (term === 'one_year_plan' ? [...v.sections].sort((a, c) => Number(c.key === 'oneYear') - Number(a.key === 'oneYear')) : v.sections) : []
  const addIssue = async (sectionLabel: string, id: string, text: string) => {
    setBusy(id)
    const r = await act({ k: 'capture_issue', title: `${sectionLabel}: ${text}`.slice(0, 300) })
    setBusy(null)
    if (r.ok) {
      setAdded((a) => [...a, id])
      toast.success(`Added to ${issueWord}`)
    }
  }
  return (
    <>
      <SectionTitle
        aside={
          <Button className="ml-auto" size="sm" asChild>
            <Link href={`/${slug}/vision?edit=1`}>Propose change</Link>
          </Button>
        }
      >
        {b.labels[term]?.s}
      </SectionTitle>
      <Hint>Read through the {b.labels.vision_plan?.s.toLowerCase()} together. Anything that no longer fits goes to {issueWord}; larger edits start a draft.</Hint>
      {!v || !v.hasPublished || sections.length === 0 ? (
        <Empty>
          The {b.labels.vision_plan?.s.toLowerCase()} has nothing published yet.{' '}
          <Link href={`/${slug}/vision`} className="font-[550] text-accent-text hover:underline">Open the {b.labels.vision_plan?.s.toLowerCase()}</Link>
        </Empty>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <section key={s.key} className="rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]" data-testid={`vision-${s.key}`}>
              <h3 className="border-b border-line-faint px-4 py-2.5 text-sm font-[600] text-ink">{s.label}</h3>
              <div className="divide-y divide-line-faint">
                {s.items.map((it) => {
                  const done = added.includes(it.id) || b.issues.some((i) => i.title === `${s.label}: ${it.text}`.slice(0, 300))
                  return (
                    <div key={it.id} className="group flex items-start gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        {it.label && <div className="text-xs text-faint">{it.label}</div>}
                        <div className="text-base text-ink">{it.text}</div>
                      </div>
                      {done ? (
                        <span className="mt-0.5 inline-flex h-6 items-center gap-1 px-2 text-xs font-[550] text-success-text"><Check size={13} strokeWidth={2.4} /> In {issueWord}</span>
                      ) : (
                        <Button size="sm" variant="ghost" className="mt-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100" loading={busy === it.id} onClick={() => addIssue(s.label, it.id, it.text)}>
                          <ArrowDownToLine size={13} /> Add to {issueWord}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ set next quarter's priorities

export function PrioritySettingView({ b, act }: { b: Bundle; act: Act }) {
  const plan = b.priorityPlan
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(b.me?.id ?? '')
  const [level, setLevel] = useState<'company' | 'individual'>('company')
  const [busy, setBusy] = useState(false)
  const issueWord = b.labels.issue?.p.toLowerCase() ?? 'issues'
  const items = plan?.items ?? []
  const kept = items.filter((p) => p.status !== 'dropped')
  const add = async () => {
    if (!title.trim() || !owner || !plan) return
    setBusy(true)
    const r = await act({ k: 'priority_create', title: title.trim(), ownerId: owner, level, quarter: plan.quarter })
    setBusy(false)
    if (r.ok) setTitle('')
  }
  return (
    <>
      <SectionTitle aside={plan && <span className="text-sm tabular-nums text-body">{plan.quarter} · {kept.length} {kept.length === 1 ? b.labels.priority?.s.toLowerCase() : b.labels.priority?.p.toLowerCase()}</span>}>{b.labels.priority_setting?.s}</SectionTitle>
      <Hint>One owner per {b.labels.priority?.s.toLowerCase()}. Company-level commitments first, then individual ones. Drop what is not a {b.labels.priority?.s.toLowerCase()} into {issueWord}.</Hint>

      <form
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--m-line)]"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input className="min-w-56 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`New ${b.labels.priority?.s.toLowerCase()} for ${plan?.quarter ?? 'next quarter'}`} aria-label={`New ${b.labels.priority?.s} title`} />
        <OwnerSelect b={b} value={owner} onChange={setOwner} />
        <Segmented aria-label="Level" value={level} onValueChange={setLevel} options={[{ value: 'company', label: 'Company' }, { value: 'individual', label: 'Individual' }]} />
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim() || !owner}><Plus size={14} /> Add</Button>
      </form>

      {items.length === 0 ? (
        <Empty>No {b.labels.priority?.p.toLowerCase()} for {plan?.quarter ?? 'next quarter'} yet. Add the first one above.</Empty>
      ) : (
        <List>
          {items.map((p) => (
            <div key={p.id} className="flex min-h-12 items-center gap-3 px-4 py-1.5" data-testid="plan-item">
              <span className={cn('min-w-0 flex-1 truncate text-base', p.status === 'dropped' ? 'text-faint line-through' : 'text-ink')}>{p.title}</span>
              <Badge className="capitalize">{p.level}</Badge>
              <Owner b={b} id={p.ownerId} size={18} />
              {p.status === 'dropped' ? (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-xs font-[550] text-success-text"><Check size={13} strokeWidth={2.4} /> In {issueWord}</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={async () => {
                  const r = await act({ k: 'priority_drop', id: p.id, title: p.title })
                  if (r.ok) toast.success(`Dropped to ${issueWord}`)
                }}>
                  <ArrowDownToLine size={13} /> Drop to {issueWord}
                </Button>
              )}
            </div>
          ))}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ team health

export function TeamHealthView({ b, act }: { b: Bundle; act: Act }) {
  const health = b.live.teamHealth
  const att = people(b)
  const mean = avg(Object.values(health).map((h) => h.rating))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const set = (personId: string, rating: number | null, note?: string) =>
    void act({ k: 'team_health', personId, rating, note }, (x) => {
      const next = { ...x.live.teamHealth }
      if (rating === null) delete next[personId]
      else next[personId] = { rating, note: note ?? next[personId]?.note ?? '' }
      return { ...x, live: { ...x.live, teamHealth: next } }
    })
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{Object.keys(health).length} of {att.length} in{mean !== null ? ` · average ${mean}` : ''}</span>}>{b.labels.team_health?.s}</SectionTitle>
      <Hint>How is each person doing, and how is the team working together? Rate 1 to 10 and leave a short note.</Hint>
      <List>
        {att.map((p) => {
          const h = health[p.id]
          const note = notes[p.id] ?? h?.note ?? ''
          return (
            <div key={p.id} className="flex flex-col gap-2 px-4 py-3" data-testid={`health-${p.id}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-40"><Owner b={b} id={p.id} size={22} /></span>
                <ScoreButtons value={h?.rating ?? null} label={`Team health rating for ${p.name}`} onChange={(v) => set(p.id, v, note)} />
              </div>
              <Input
                value={note}
                disabled={!h}
                placeholder={h ? 'Note (what is working, what is not)' : 'Rate first, then add a note'}
                aria-label={`Note for ${p.name}`}
                onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                onBlur={() => h && note !== h.note && set(p.id, h.rating, note)}
              />
            </div>
          )
        })}
      </List>
    </>
  )
}

// ------------------------------------------------------------------ build the issues list

export function IssuesBuildView({ b, act }: { b: Bundle; act: Act }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(b.me?.id ?? '')
  const [long, setLong] = useState(false)
  const [busy, setBusy] = useState(false)
  const issues = b.labels.issue
  const added = b.issues.filter((i) => b.live.ids.addedIssueIds.includes(i.id))
  const add = async () => {
    if (!title.trim()) return
    setBusy(true)
    const r = await act({ k: 'capture_issue', title: title.trim(), ownerId: owner || undefined, long })
    setBusy(false)
    if (r.ok) setTitle('')
  }
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{added.length} added · {b.live.counts.openIssues} open on the list</span>}>{b.labels.issues_list_build?.s}</SectionTitle>
      <Hint>Get everything out of everyone's head. One line per {issues?.s.toLowerCase()}, no discussion yet. Long-term {issues?.p.toLowerCase()} stay off the weekly list.</Hint>
      <form
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--m-line)]"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input className="min-w-56 flex-1" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Add an ${issues?.s.toLowerCase()} and press Enter`} aria-label={`New ${issues?.s} title`} />
        <OwnerSelect b={b} value={owner} onChange={setOwner} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <Switch checked={long} onCheckedChange={setLong} aria-label="Long-term" /> Long-term
        </label>
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}><Plus size={14} /> Add</Button>
      </form>
      {added.length === 0 ? (
        <Empty>Nothing added in this meeting yet.</Empty>
      ) : (
        <List>
          {added.map((i) => (
            <div key={i.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5" data-testid="built-issue">
              <span className="min-w-0 flex-1 truncate text-base text-ink">{i.title}</span>
              {i.horizon === 'long' && <Badge>Long-term</Badge>}
              <Owner b={b} id={i.ownerId} size={18} />
            </div>
          ))}
        </List>
      )}
    </>
  )
}

// ------------------------------------------------------------------ next steps

export function NextStepsView({ b, act, today }: { b: Bundle; act: Act; today: string }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(b.me?.id ?? '')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const todos = b.todos.filter((t) => b.live.newTodoIds.includes(t.id))
  const word = b.labels.todo
  const add = async () => {
    if (!title.trim() || !owner) return
    setBusy(true)
    const r = await act({ k: 'capture_todo', title: title.trim(), ownerId: owner, dueDate: due || undefined })
    setBusy(false)
    if (r.ok) {
      setTitle('')
      setDue('')
    }
  }
  return (
    <>
      <SectionTitle aside={<span className="text-sm tabular-nums text-body">{todos.length} {todos.length === 1 ? word?.s.toLowerCase() : word?.p.toLowerCase()}</span>}>{b.labels.next_steps?.s}</SectionTitle>
      <Hint>Every {word?.s.toLowerCase()} from this meeting, with one owner and a date. Add anything that is missing.</Hint>
      <form
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--m-line)]"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input className="min-w-56 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Add a ${word?.s.toLowerCase()}`} aria-label={`New ${word?.s} title`} />
        <OwnerSelect b={b} value={owner} onChange={setOwner} />
        <Input type="date" className="w-36" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim() || !owner}><Plus size={14} /> Add</Button>
      </form>
      {todos.length === 0 ? (
        <Empty>No {word?.p.toLowerCase()} yet. {word?.p} captured here and in {b.labels.issue?.p.toLowerCase()} discussions land on this list.</Empty>
      ) : (
        <List>
          {todos.map((t) => (
            <div key={t.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5" data-testid="next-step">
              <Tick on={false} size={16} />
              <span className="min-w-0 flex-1 truncate text-base text-ink">{t.title}</span>
              <Owner b={b} id={t.ownerId} size={18} />
              <span className="w-14 text-right text-xs text-faint">{fmtDate(t.dueDate)}</span>
            </div>
          ))}
        </List>
      )}
    </>
  )
}
