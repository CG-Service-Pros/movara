'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, ListPlus, MoreHorizontal, Pencil, Plus, Settings2, Archive } from 'lucide-react'
import { Avatar } from '@movara/ui/avatar'
import { AgentMark } from '@movara/ui/agent-mark'
import { Button } from '@movara/ui/button'
import { EmptyState } from '@movara/ui/empty-state'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Switch } from '@movara/ui/switch'
import { Tip } from '@movara/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { cn } from '@movara/ui/cn'
import { OwnerPicker, useAct, type PersonLite } from '../issues/common'
import { formatGoal, formatValue, periodLabel, statusOf, type CellStatus, type Comparison, type Unit } from './format'
import type { Provenance } from './provenance'
import {
  archiveMetricAction, createMetricAction, recordValueAction, reorderMetricsAction, updateMetricAction, updateSettingsAction, type MetricInput,
} from '@/app/(app)/[org]/scorecard/actions'
import { createIssuesAction } from '@/app/(app)/[org]/issues/actions'
import { useCanWrite } from '@/components/shell/shell-context'

export type MetricItem = {
  id: string
  title: string
  description: string | null
  ownerIds: string[]
  comparison: Comparison
  goal: number | null
  goalUpper: number | null
  unit: Unit
  scale: number
  decimals: number
  additive: boolean
  cells: { periodStart: string; value: number | null }[]
}
type Interval = 'day' | 'week' | 'month' | 'quarter'
type SC = { id: string; teamId: string; teamName: string; interval: Interval; weekStartDay: number; periodsShown: number }
type Labels = { metric: string; metrics: string; scorecard: string; issue: string; issues: string }

const key = (metricId: string, period: string) => `${metricId}|${period}`
const INTERVAL_WORD: Record<Interval, string> = { day: 'day', week: 'week', month: 'month', quarter: 'quarter' }

export function ScorecardView({
  orgSlug, scorecard, shownPeriods, scorecards, periods, metrics, provenance, people, labels, highlightId, openNew,
}: {
  orgSlug: string
  scorecard: SC
  shownPeriods: number
  scorecards: { teamId: string; teamName: string }[]
  periods: string[]
  metrics: MetricItem[]
  provenance: Record<string, Provenance>
  people: PersonLite[]
  labels: Labels
  /** Deep links: `?id=<metricId>` highlights the row, `?new=1` opens the add dialog. */
  highlightId?: string
  openNew?: boolean
}) {
  const router = useRouter()
  const { act } = useAct()
  const [order, setOrder] = React.useState<'fwd' | 'rev'>('fwd')
  const [edits, setEdits] = React.useState<Record<string, number | null>>({})
  const [editing, setEditing] = React.useState<string | null>(null)
  const canWrite = useCanWrite()
  const [dialog, setDialog] = React.useState<{ metric: MetricItem | null } | null>(openNew ? { metric: null } : null)
  const [settings, setSettings] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => setEdits({}), [metrics])
  React.useEffect(() => {
    if (highlightId) scrollRef.current?.querySelector(`[data-metric-id="${highlightId}"]`)?.scrollIntoView({ block: 'center' })
  }, [highlightId])
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = order === 'fwd' ? el.scrollWidth : 0
  }, [order, periods.length])

  const current = periods[periods.length - 1]!
  const shown = order === 'fwd' ? periods : [...periods].reverse()
  const personName = (id: string) => people.find((p) => p.id === id)

  const valueOf = (m: MetricItem, period: string): number | null => {
    const k = key(m.id, period)
    if (k in edits) return edits[k]!
    return m.cells.find((c) => c.periodStart === period)?.value ?? null
  }
  const onTrack = metrics.filter((m) => statusOf(m, valueOf(m, current)) === 'on').length

  const save = (m: MetricItem, period: string, value: number | null) => {
    const k = key(m.id, period)
    const before = valueOf(m, period)
    setEditing(null)
    if (value === before) return
    setEdits((e) => ({ ...e, [k]: value }))
    act(() => recordValueAction(orgSlug, scorecard.id, m.id, period, value), {
      onError: () => setEdits((e) => { const { [k]: _, ...rest } = e; return rest }),
    })
  }

  const reorder = (idx: number, dir: -1 | 1) => {
    const ids = metrics.map((m) => m.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j]!, ids[idx]!]
    act(() => reorderMetricsAction(orgSlug, scorecard.id, ids))
  }
  const dropToIssues = (m: MetricItem) => {
    const off = statusOf(m, valueOf(m, current)) === 'off'
    act(() => createIssuesAction(orgSlug, { title: off ? `${m.title} is off track` : m.title, ownerIds: m.ownerIds, teamId: scorecard.teamId, horizon: 'short', source: { type: 'metric', id: m.id } }), { success: `Dropped to ${labels.issues.toLowerCase()}` })
  }

  const colTemplate = { width: 'max-content', minWidth: '100%' } as const

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {scorecards.length > 1 ? (
          <Select value={scorecard.teamId} onValueChange={(v) => router.push(`?team=${v}`)}>
            <SelectTrigger className="w-48" aria-label="Team"><SelectValue /></SelectTrigger>
            <SelectContent>{scorecards.map((s) => <SelectItem key={s.teamId} value={s.teamId}>{s.teamName}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <span className="text-base font-semibold text-ink">{scorecard.teamName}</span>
        )}
        {metrics.length > 0 && (
          <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums', onTrack === metrics.length ? 'bg-success-soft text-success-text' : onTrack === 0 ? 'bg-danger-soft text-danger-text' : 'bg-canvas text-body shadow-[inset_0_0_0_1px_var(--m-line)]')}>
            {onTrack} of {metrics.length} on track this {INTERVAL_WORD[scorecard.interval]}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={String(shownPeriods)} onValueChange={(v) => router.push(`?team=${scorecard.teamId}&periods=${v}`)}>
            <SelectTrigger className="w-32" aria-label="Periods shown"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[4, 8, 13, 26, 52].concat([4, 8, 13, 26, 52].includes(shownPeriods) ? [] : [shownPeriods]).sort((a, b) => a - b).map((n) => <SelectItem key={n} value={String(n)}>{n} {INTERVAL_WORD[scorecard.interval]}s</SelectItem>)}
            </SelectContent>
          </Select>
          <Tip label={order === 'fwd' ? 'Showing oldest first' : 'Showing newest first'}>
            <Button variant="secondary" onClick={() => setOrder(order === 'fwd' ? 'rev' : 'fwd')} title="Reverse period order"><ArrowLeftRight size={14} strokeWidth={1.7} />{order === 'fwd' ? 'Oldest first' : 'Newest first'}</Button>
          </Tip>
          <Tip label={`${labels.scorecard} settings`}><Button size="icon" variant="ghost" aria-label="Settings" onClick={() => setSettings(true)}><Settings2 size={15} strokeWidth={1.7} /></Button></Tip>
          {canWrite && <Button variant="primary" onClick={() => setDialog({ metric: null })}><Plus size={14} strokeWidth={2} />Add {labels.metric.toLowerCase()}</Button>}
        </div>
      </div>

      {metrics.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title={`No ${labels.metrics.toLowerCase()} yet`} description={`Add the few numbers ${scorecard.teamName} reviews every ${INTERVAL_WORD[scorecard.interval]}. Each one gets an owner and a goal.`} action={canWrite ? <Button variant="primary" onClick={() => setDialog({ metric: null })}><Plus size={14} strokeWidth={2} />Add {labels.metric.toLowerCase()}</Button> : undefined} />
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto pb-6">
          <table className="border-separate border-spacing-0 text-base" style={colTemplate}>
            <thead>
              <tr className="text-xs font-[550] text-faint">
                <th className="sticky left-0 top-0 z-20 w-40 min-w-40 max-w-40 border-b border-line bg-surface py-2 pl-4 pr-2 text-left sm:w-72 sm:min-w-72 sm:max-w-72">{labels.metric}</th>
                <th className="sticky left-40 top-0 z-20 w-16 min-w-16 border-b border-line bg-surface px-1 py-2 text-left shadow-[1px_0_0_var(--m-line)] sm:left-72 sm:w-24 sm:min-w-24">Goal</th>
                {shown.map((p) => (
                  <th key={p} data-now={p === current || undefined} className={cn('sticky top-0 z-10 w-[76px] min-w-[76px] border-b border-line bg-surface px-1 py-2 text-right tabular-nums', p === current && 'text-ink')}>
                    <span className="pr-2.5">{periodLabel(p, scorecard.interval)}</span>
                    {p === current && <span className="mt-0.5 block pr-2.5 text-2xs font-[500] text-accent-text">Now</span>}
                  </th>
                ))}
                <th className="sticky top-0 z-10 w-20 min-w-20 border-b border-l border-line bg-surface px-1 py-2 text-right"><span className="pr-2.5">Total</span></th>
                <th className="sticky top-0 z-10 w-20 min-w-20 border-b border-line bg-surface py-2 pl-1 pr-4 text-right"><span className="pr-2.5">Avg</span></th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, idx) => {
                const vals = periods.map((p) => valueOf(m, p)).filter((v): v is number => v !== null)
                const sum = vals.reduce((a, b) => a + b, 0)
                const avg = vals.length ? sum / vals.length : null
                const owner = m.ownerIds[0] ? personName(m.ownerIds[0]) : undefined
                return (
                  <tr key={m.id} data-metric-id={m.id} data-highlight={m.id === highlightId || undefined} className={cn('group', m.id === highlightId && '[&>td]:bg-accent-soft')}>
                    <td className="sticky left-0 z-10 h-12 w-40 min-w-40 max-w-40 border-b border-line-faint bg-surface pl-4 pr-2 sm:w-72 sm:min-w-72 sm:max-w-72">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {owner ? <Avatar name={owner.name} size={22} /> : <span className="size-[22px] rounded-full bg-canvas" />}
                        <span className="min-w-0 flex-1 truncate font-[500] text-ink" title={m.description ? `${m.title}: ${m.description}` : m.title}>{m.title}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" disabled={!canWrite} className="size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 disabled:invisible data-[state=open]:opacity-100" aria-label={`Actions for ${m.title}`}><MoreHorizontal size={15} strokeWidth={1.7} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog({ metric: m })}>Edit {labels.metric.toLowerCase()}</DropdownMenuItem>
                            <DropdownMenuItem icon={<ArrowUp />} disabled={idx === 0} onSelect={() => reorder(idx, -1)}>Move up</DropdownMenuItem>
                            <DropdownMenuItem icon={<ArrowDown />} disabled={idx === metrics.length - 1} onSelect={() => reorder(idx, 1)}>Move down</DropdownMenuItem>
                            <DropdownMenuItem icon={<ListPlus />} onSelect={() => dropToIssues(m)}>Drop to {labels.issues.toLowerCase()}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive icon={<Archive />} onSelect={() => act(() => archiveMetricAction(orgSlug, m.id), { success: `${labels.metric} archived` })}>Archive</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                    <td className="sticky left-40 z-10 w-16 min-w-16 max-w-16 overflow-hidden text-ellipsis border-b border-line-faint bg-surface px-1 text-sm text-body tabular-nums whitespace-nowrap shadow-[1px_0_0_var(--m-line)] sm:left-72 sm:w-24 sm:min-w-24 sm:max-w-24" title={formatGoal(m)}>{formatGoal(m)}</td>
                    {shown.map((p) => {
                      const k = key(m.id, p)
                      const value = valueOf(m, p)
                      const st = statusOf(m, value)
                      const prov = k in edits ? undefined : provenance[k]
                      return (
                        <td key={p} className="border-b border-line-faint p-0.5">
                          <Cell
                            metric={m}
                            period={p}
                            value={value}
                            status={st}
                            isNow={p === current}
                            editing={editing === k}
                            prov={prov}
                            onEdit={() => canWrite && setEditing(k)}
                            onCancel={() => setEditing(null)}
                            onSave={(v) => save(m, p, v)}
                          />
                        </td>
                      )
                    })}
                    <td className="border-b border-l border-line-faint px-1 text-right text-sm font-[500] tabular-nums text-body"><span className="pr-2.5">{m.additive && vals.length ? formatValue(sum, m) : <span className="text-faint">—</span>}</span></td>
                    <td className="border-b border-line-faint pl-1 pr-4 text-right text-sm tabular-nums text-body"><span className="pr-2.5">{avg !== null ? formatValue(avg, { ...m, decimals: Math.max(m.decimals, m.unit === 'currency' || m.scale > 1 ? 0 : 1) }) : <span className="text-faint">—</span>}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <MetricDialog key={dialog?.metric?.id ?? 'new'} open={!!dialog} metric={dialog?.metric ?? null} onOpenChange={(o) => !o && setDialog(null)} orgSlug={orgSlug} scorecardId={scorecard.id} people={people} labels={labels} />
      <SettingsDialog open={settings} onOpenChange={setSettings} orgSlug={orgSlug} scorecard={scorecard} labels={labels} />
    </div>
  )
}

function Cell({ metric, value, status, isNow, editing, prov, onEdit, onCancel, onSave }: {
  metric: MetricItem; period: string; value: number | null; status: CellStatus; isNow: boolean; editing: boolean; prov?: Provenance
  onEdit: () => void; onCancel: () => void; onSave: (v: number | null) => void
}) {
  const cancelled = React.useRef(false)
  const [draft, setDraft] = React.useState('')
  React.useEffect(() => { if (editing) { cancelled.current = false; setDraft(value === null ? '' : String(value)) } }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  if (editing) {
    const commit = () => {
      if (cancelled.current) return
      const t = draft.trim()
      if (t === '') return onSave(null)
      const n = Number(t.replace(/,/g, ''))
      if (Number.isNaN(n)) return onCancel()
      onSave(n)
    }
    return (
      <input
        autoFocus
        type="number"
        step="any"
        inputMode="decimal"
        aria-label={`${metric.title} value`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; onCancel() }
        }}
        className="h-8 w-full rounded-[7px] bg-surface px-2 text-right text-base tabular-nums max-sm:text-[16px] text-ink outline-none shadow-[0_0_0_1.5px_var(--color-accent),0_0_0_3px_var(--color-accent-soft)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    )
  }
  const text = value === null ? '—' : formatValue(value, metric)
  const mark = prov?.agent ? (
    <Tip label={<span>Entered by {prov.name}{prov.onBehalfOf ? ` for ${prov.onBehalfOf}` : ''} · {new Date(prov.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}>
      <span className="inline-flex"><AgentMark size={13} /></span>
    </Tip>
  ) : null
  return (
    <button
      type="button"
      onClick={onEdit}
      data-state={status}
      aria-label={`${metric.title}: ${text}. Edit`}
      className={cn(
        'flex h-8 w-full cursor-text items-center justify-end gap-1.5 rounded-[7px] px-2.5 text-base tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50',
        status === 'off' && 'bg-danger-soft font-[550] text-danger-text',
        status === 'on' && (isNow ? 'bg-canvas text-ink hover:bg-well' : 'text-ink hover:bg-canvas'),
        status === 'missing' && 'text-faint shadow-[inset_0_0_0_1px_var(--m-line)] hover:bg-canvas',
        status === 'missing' && isNow && 'bg-surface',
      )}
    >
      {mark}
      {text}
    </button>
  )
}

const COMPARISONS: { value: Comparison; label: string }[] = [
  { value: 'gte', label: 'At least (≥)' }, { value: 'lte', label: 'At most (≤)' }, { value: 'gt', label: 'More than (>)' },
  { value: 'lt', label: 'Less than (<)' }, { value: 'eq', label: 'Exactly (=)' }, { value: 'between', label: 'Between' },
]

function MetricDialog({ open, metric, onOpenChange, orgSlug, scorecardId, people, labels }: { open: boolean; metric: MetricItem | null; onOpenChange: (o: boolean) => void; orgSlug: string; scorecardId: string; people: PersonLite[]; labels: Labels }) {
  const { act, pending } = useAct()
  const [title, setTitle] = React.useState(metric?.title ?? '')
  const [description, setDescription] = React.useState(metric?.description ?? '')
  const [owners, setOwners] = React.useState<string[]>(metric?.ownerIds ?? [])
  const [comparison, setComparison] = React.useState<Comparison>(metric?.comparison ?? 'gte')
  const [goal, setGoal] = React.useState(metric?.goal != null ? String(metric.goal) : '')
  const [upper, setUpper] = React.useState(metric?.goalUpper != null ? String(metric.goalUpper) : '')
  const [unit, setUnit] = React.useState<Unit>(metric?.unit ?? 'number')
  const [scale, setScale] = React.useState(String(metric?.scale ?? 1))
  const [decimals, setDecimals] = React.useState(String(metric?.decimals ?? 0))
  const [additive, setAdditive] = React.useState(metric?.additive ?? false)
  const goalN = Number(goal)
  const upperN = Number(upper)
  const valid = title.trim() && goal !== '' && !Number.isNaN(goalN) && (comparison !== 'between' || (upper !== '' && upperN >= goalN))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const input: MetricInput = { title: title.trim(), description: description.trim() || null, ownerIds: owners, comparison, goal: goalN, goalUpper: comparison === 'between' ? upperN : null, unit, scale: Number(scale), decimals: Math.max(0, Math.min(6, Math.round(Number(decimals) || 0))), additive }
    act(() => (metric ? updateMetricAction(orgSlug, metric.id, input) : createMetricAction(orgSlug, scorecardId, input)), { success: metric ? 'Saved' : `${labels.metric} added`, onDone: () => onOpenChange(false) })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{metric ? `Edit ${labels.metric.toLowerCase()}` : `Add ${labels.metric.toLowerCase()}`}</DialogTitle>
            <DialogDescription>A number someone owns and reports every period, with a goal.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="m-title"><Input id="m-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qualified leads" /></Field>
          <Field label="Description" htmlFor="m-desc" hint="Optional. What this number measures and where it comes from."><Input id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Leads that passed qualification this week" /></Field>
          <Field label="Owners"><OwnerPicker people={people} value={owners} onChange={setOwners} placeholder="No owner" /></Field>
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <Field label="Goal">
              <Select value={comparison} onValueChange={(v) => setComparison(v as Comparison)}>
                <SelectTrigger aria-label="Comparison"><SelectValue /></SelectTrigger>
                <SelectContent>{COMPARISONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className={cn('grid gap-2', comparison === 'between' ? 'grid-cols-2' : 'grid-cols-1')}>
              <Field label={comparison === 'between' ? 'From' : 'Target'} htmlFor="m-goal"><Input id="m-goal" type="number" step="any" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="10" /></Field>
              {comparison === 'between' && <Field label="To" htmlFor="m-upper" error={upper !== '' && upperN < goalN ? 'Must be at least the lower bound' : undefined}><Input id="m-upper" type="number" step="any" value={upper} onChange={(e) => setUpper(e.target.value)} /></Field>}
            </div>
          </div>
          <Field label="Unit">
            <Segmented aria-label="Unit" value={unit} onValueChange={setUnit} options={[{ value: 'number', label: 'Number' }, { value: 'percent', label: 'Percent' }, { value: 'currency', label: 'Currency' }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display scale" hint="Values stay exact; 1,000 shows 40000 as 40k.">
              <Select value={scale} onValueChange={setScale}>
                <SelectTrigger aria-label="Scale"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">None</SelectItem><SelectItem value="1000">Thousands (k)</SelectItem><SelectItem value="1000000">Millions (M)</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Decimals" htmlFor="m-dec"><Input id="m-dec" type="number" min={0} max={6} value={decimals} onChange={(e) => setDecimals(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-3 text-base text-ink">
            <Switch checked={additive} onCheckedChange={setAdditive} aria-label="Additive" />
            <span><span className="font-[550]">Additive</span> <span className="text-body">· show a running total across periods</span></span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!valid}>{metric ? 'Save' : `Add ${labels.metric.toLowerCase()}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function SettingsDialog({ open, onOpenChange, orgSlug, scorecard, labels }: { open: boolean; onOpenChange: (o: boolean) => void; orgSlug: string; scorecard: SC; labels: Labels }) {
  const { act, pending } = useAct()
  const [interval, setInterval] = React.useState<Interval>(scorecard.interval)
  const [weekStart, setWeekStart] = React.useState(String(scorecard.weekStartDay))
  const [count, setCount] = React.useState(String(scorecard.periodsShown))
  React.useEffect(() => { if (open) { setInterval(scorecard.interval); setWeekStart(String(scorecard.weekStartDay)); setCount(String(scorecard.periodsShown)) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.round(Number(count))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (n >= 1 && n <= 104) act(() => updateSettingsAction(orgSlug, scorecard.id, { interval, weekStartDay: Number(weekStart), periodsShown: n }), { success: 'Settings saved', onDone: () => onOpenChange(false) }) }}>
          <DialogHeader><DialogTitle>{labels.scorecard} settings</DialogTitle><DialogDescription>How {scorecard.teamName} tracks its numbers. Needs an admin.</DialogDescription></DialogHeader>
          <Field label="Interval">
            <Select value={interval} onValueChange={(v) => setInterval(v as Interval)}>
              <SelectTrigger aria-label="Interval"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="day">Daily</SelectItem><SelectItem value="week">Weekly</SelectItem><SelectItem value="month">Monthly</SelectItem><SelectItem value="quarter">Quarterly</SelectItem></SelectContent>
            </Select>
          </Field>
          {interval === 'week' && (
            <Field label="Week starts on">
              <Select value={weekStart} onValueChange={setWeekStart}>
                <SelectTrigger aria-label="Week start"><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Periods shown" htmlFor="sc-n" hint="Between 1 and 104."><Input id="sc-n" type="number" min={1} max={104} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" loading={pending} disabled={!(n >= 1 && n <= 104)}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
