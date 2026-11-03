'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { StatusGlyph } from '@movara/ui/status-glyph'
import { toast } from '@movara/ui/toaster'
import { PageHeader } from '@movara/ui/page-header'
import { discardVisionDraft, publishVisionDraft, saveVisionSection } from '@/app/(app)/[org]/vision/actions'
import { Col, Figure, Provenance, Section, quarterTitle, statusToGlyph } from './vision-doc'
import { PrintStyles } from './print'
import type { FullSections, IssueLite, PriorityLite, VisionLabels } from './shared'

type Key = keyof FullSections
type Picture = FullSections['oneYear']

const inputCls =
  'w-full rounded-md bg-transparent px-2 text-base text-ink shadow-[0_0_0_1px_var(--m-line-faint)] outline-none transition-shadow placeholder:text-faint hover:bg-canvas focus:bg-surface focus:shadow-[0_0_0_1px_var(--color-accent),0_0_0_3px_var(--color-accent-soft)]'
const Text = ({ className, ...p }: React.ComponentProps<'input'>) => <input className={cn(inputCls, 'h-7', className)} {...p} />
const Area = ({ className, ...p }: React.ComponentProps<'textarea'>) => <textarea rows={2} className={cn(inputCls, 'min-h-14 resize-y py-1.5 leading-snug', className)} {...p} />

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[104px_1fr] items-start gap-2.5 py-1 text-sm">
      <span className="pt-1 text-body">{label}</span>
      {children}
    </label>
  )
}

const move = <T,>(arr: T[], i: number, d: number): T[] => {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

function RowButtons({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: number) => void; onRemove: () => void }) {
  const b = 'grid size-6 place-items-center rounded-md text-icon outline-none hover:bg-nav-active hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-30'
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" aria-label="Move up" className={b} disabled={i === 0} onClick={() => onMove(-1)}>
        <ChevronUp size={14} strokeWidth={1.7} />
      </button>
      <button type="button" aria-label="Move down" className={b} disabled={i === n - 1} onClick={() => onMove(1)}>
        <ChevronDown size={14} strokeWidth={1.7} />
      </button>
      <button type="button" aria-label="Remove" className={cn(b, 'hover:text-danger-text')} onClick={onRemove}>
        <Trash2 size={13} strokeWidth={1.7} />
      </button>
    </div>
  )
}

const AddButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="mt-1.5 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-sm font-[550] text-accent-text outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent/50">
    <Plus size={13} strokeWidth={1.9} />
    {children}
  </button>
)

function StringList({ items, onChange, placeholder, addLabel, label }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string; label: string }) {
  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {items.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <Text aria-label={`${label} ${i + 1}`} value={v} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <RowButtons i={i} n={items.length} onMove={(d) => onChange(move(items, i, d))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <AddButton onClick={() => onChange([...items, ''])}>{addLabel}</AddButton>
    </div>
  )
}

function PictureEditor({ p, onChange, names, kind }: { p: Picture; onChange: (p: Picture) => void; names: Record<string, string>; kind: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-body">
          Date
          <Text type="date" aria-label={`${kind} date`} value={p.date ?? ''} onChange={(e) => onChange({ ...p, date: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-body">
          Revenue
          <Text aria-label={`${kind} revenue`} value={p.revenue} placeholder="$4.2M" onChange={(e) => onChange({ ...p, revenue: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-body">
          Profit
          <Text aria-label={`${kind} profit`} value={p.profit} placeholder="14%" onChange={(e) => onChange({ ...p, profit: e.target.value })} />
        </label>
      </div>
      <div>
        <div className="mb-1 text-xs text-body">Measurables</div>
        {p.measurables.map((m, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1">
            <Text aria-label={`${kind} measurable name ${i + 1}`} value={m.name} placeholder="Clients" onChange={(e) => onChange({ ...p, measurables: p.measurables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <Text aria-label={`${kind} measurable value ${i + 1}`} className="w-28 shrink-0" value={m.value} placeholder="240" onChange={(e) => onChange({ ...p, measurables: p.measurables.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            <RowButtons i={i} n={p.measurables.length} onMove={(d) => onChange({ ...p, measurables: move(p.measurables, i, d) })} onRemove={() => onChange({ ...p, measurables: p.measurables.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <AddButton onClick={() => onChange({ ...p, measurables: [...p.measurables, { name: '', value: '' }] })}>Add measurable</AddButton>
      </div>
      <div>
        <div className="mb-1 text-xs text-body">Goals</div>
        {p.goals.map((g, i) => {
          const prov = g.provenance
          return (
            <div key={i} className="mb-1.5">
              <div className="flex items-center gap-1">
                <span className="w-5 shrink-0 text-center text-xs text-faint tabular-nums">{i + 1}</span>
                <Text aria-label={`${kind} goal ${i + 1}`} value={g.text} placeholder="Describe the goal" onChange={(e) => onChange({ ...p, goals: p.goals.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <RowButtons i={i} n={p.goals.length} onMove={(d) => onChange({ ...p, goals: move(p.goals, i, d) })} onRemove={() => onChange({ ...p, goals: p.goals.filter((_, j) => j !== i) })} />
              </div>
              {prov?.proposedBy.type === 'agent' && (
                <div className="pl-6">
                  <Provenance agent={names[prov.proposedBy.id] ?? 'Agent'} approver={prov.approvedBy ? (names[prov.approvedBy.id] ?? 'a teammate') : undefined} />
                </div>
              )}
            </div>
          )
        })}
        <AddButton onClick={() => onChange({ ...p, goals: [...p.goals, { text: '' }] })}>Add goal</AddButton>
      </div>
    </div>
  )
}

function Pick({ checked, onChange, children }: { checked: boolean; onChange: (c: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-[30px] cursor-pointer items-center gap-2.5 rounded-md px-1 text-base text-ink hover:bg-canvas">
      <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

/** Strip blank rows before saving so a half-typed list item never fails validation. */
function clean(key: Key, v: FullSections[Key]): unknown {
  const pic = (p: Picture) => ({
    date: p.date || null,
    revenue: p.revenue,
    profit: p.profit,
    measurables: p.measurables.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), value: m.value })),
    goals: p.goals.filter((g) => g.text.trim()).map((g) => ({ ...g, text: g.text.trim() })),
  })
  switch (key) {
    case 'coreValues':
      return (v as string[]).map((x) => x.trim()).filter(Boolean)
    case 'marketing': {
      const m = v as FullSections['marketing']
      return { ...m, uniques: m.uniques.map((x) => x.trim()).filter(Boolean) }
    }
    case 'longRangeTarget': {
      const l = v as FullSections['longRangeTarget']
      return { text: l.text, date: l.date || null }
    }
    case 'threeYear':
    case 'oneYear':
      return pic(v as Picture)
    default:
      return v
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function VisionEditor({
  slug,
  wordmark,
  revisionId,
  number,
  initial,
  labels: L,
  names,
  priorities,
  issues,
  canPublish,
}: {
  slug: string
  wordmark: string
  revisionId: string
  number: number
  initial: FullSections
  labels: VisionLabels
  names: Record<string, string>
  priorities: PriorityLite[]
  issues: IssueLite[]
  canPublish: boolean
}) {
  const router = useRouter()
  const [s, setS] = React.useState(initial)
  const latest = React.useRef(initial)
  const timers = React.useRef(new Map<Key, ReturnType<typeof setTimeout>>())
  const inflight = React.useRef(0)
  const [state, setState] = React.useState<SaveState>('idle')
  const [busy, startBusy] = React.useTransition()

  const flush = React.useCallback(
    async (key: Key) => {
      const t = timers.current.get(key)
      if (t) clearTimeout(t)
      timers.current.delete(key)
      inflight.current++
      setState('saving')
      const r = await saveVisionSection(slug, revisionId, key, clean(key, latest.current[key]))
      inflight.current--
      if (!r.ok) {
        setState('error')
        toast.error(r.error)
      } else if (inflight.current === 0 && timers.current.size === 0) setState('saved')
    },
    [slug, revisionId],
  )
  const flushAll = async () => {
    await Promise.all([...timers.current.keys()].map((k) => flush(k)))
    while (inflight.current > 0) await new Promise((r) => setTimeout(r, 40))
  }
  React.useEffect(() => {
    const m = timers.current
    return () => m.forEach((t) => clearTimeout(t))
  }, [])

  function set<K extends Key>(key: K, value: FullSections[K]) {
    latest.current = { ...latest.current, [key]: value }
    setS(latest.current)
    setState('saving')
    const old = timers.current.get(key)
    if (old) clearTimeout(old)
    timers.current.set(key, setTimeout(() => void flush(key), 700))
  }

  const publish = () =>
    startBusy(async () => {
      await flushAll()
      if (state === 'error') return
      const r = await publishVisionDraft(slug, revisionId)
      if (!r.ok) return void toast.error(r.error)
      toast(r.needsApproval ? 'Sent for approval' : `Published v${number}`)
      router.push(`/${slug}/vision`)
      router.refresh()
    })
  const discard = () => {
    if (!window.confirm('Discard this draft? Your edits will be lost.')) return
    startBusy(async () => {
      Array.from(timers.current.values()).forEach(clearTimeout)
      timers.current.clear()
      const r = await discardVisionDraft(slug, revisionId)
      if (!r.ok) return void toast.error(r.error)
      toast('Draft discarded')
      router.push(`/${slug}/vision`)
      router.refresh()
    })
  }

  const issueOptions = issues
  return (
    <>
      <PrintStyles />
      <PageHeader
        title={L.vision}
        meta={<Badge tone="warning">Draft v{number}</Badge>}
        actions={
          <>
            <span aria-live="polite" data-testid="save-state" className="mr-1 text-sm text-body">
              {state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : state === 'error' ? 'Save failed' : ''}
            </span>
            <Button variant="ghost" asChild>
              <Link href={`/${slug}/vision`}>
                <ArrowLeft size={14} strokeWidth={1.7} />
                Back to published
              </Link>
            </Button>
            <Button variant="ghost" onClick={discard} disabled={busy}>
              Discard draft
            </Button>
            {canPublish ? (
              <Button variant="primary" onClick={publish} loading={busy}>
                Publish
              </Button>
            ) : (
              <span className="text-sm text-body">Admins publish drafts</span>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5" data-print-body>
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-7 md:grid-cols-2">
          <Col title="Where we're going">
            <Section title={L.coreValues}>
              <StringList label="Core value" items={s.coreValues} onChange={(v) => set('coreValues', v)} placeholder="Own the outcome" addLabel="Add value" />
            </Section>
            <Section title={L.coreFocus}>
              <Labeled label="Purpose">
                <Text aria-label="Purpose" value={s.coreFocus.purpose} onChange={(e) => set('coreFocus', { ...s.coreFocus, purpose: e.target.value })} />
              </Labeled>
              <Labeled label="Niche">
                <Text aria-label="Niche" value={s.coreFocus.niche} onChange={(e) => set('coreFocus', { ...s.coreFocus, niche: e.target.value })} />
              </Labeled>
            </Section>
            <Section title={L.longRangeTarget}>
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <Text aria-label="Long-range target" value={s.longRangeTarget.text} placeholder="1,000 companies running on our rhythm" onChange={(e) => set('longRangeTarget', { ...s.longRangeTarget, text: e.target.value })} />
                <Text type="date" aria-label="Long-range target date" value={s.longRangeTarget.date ?? ''} onChange={(e) => set('longRangeTarget', { ...s.longRangeTarget, date: e.target.value || null })} />
              </div>
            </Section>
            <Section title={L.marketing}>
              <Labeled label="Target market">
                <Area aria-label="Target market" value={s.marketing.targetMarket} onChange={(e) => set('marketing', { ...s.marketing, targetMarket: e.target.value })} />
              </Labeled>
              <Labeled label="Uniques">
                <StringList label="Unique" items={s.marketing.uniques} onChange={(v) => set('marketing', { ...s.marketing, uniques: v })} placeholder="What sets us apart" addLabel="Add unique" />
              </Labeled>
              <Labeled label="Proven process">
                <Area aria-label="Proven process" value={s.marketing.provenProcess} onChange={(e) => set('marketing', { ...s.marketing, provenProcess: e.target.value })} />
              </Labeled>
              <Labeled label="Guarantee">
                <Area aria-label="Guarantee" value={s.marketing.guarantee} onChange={(e) => set('marketing', { ...s.marketing, guarantee: e.target.value })} />
              </Labeled>
            </Section>
            <Section title={L.threeYear}>
              <PictureEditor kind="3-year" p={s.threeYear} names={names} onChange={(p) => set('threeYear', p)} />
            </Section>
          </Col>

          <Col title="This year">
            <Section title={L.oneYear}>
              <PictureEditor kind="1-year" p={s.oneYear} names={names} onChange={(p) => set('oneYear', p)} />
            </Section>
            <Section title={`${quarterTitle(s.quarterly.quarter)} ${L.priority}`}>
              <div className="mb-2 flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-body">
                  Revenue
                  <Text aria-label="Quarter revenue" value={s.quarterly.revenue} onChange={(e) => set('quarterly', { ...s.quarterly, revenue: e.target.value })} />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-body">
                  Profit
                  <Text aria-label="Quarter profit" value={s.quarterly.profit} onChange={(e) => set('quarterly', { ...s.quarterly, profit: e.target.value })} />
                </label>
              </div>
              <p className="mb-1 text-xs text-body">Linked to the current quarter. Leave all unchecked to show every company one.</p>
              {priorities.map((p) => (
                <Pick
                  key={p.id}
                  checked={s.quarterly.priorityIds.includes(p.id)}
                  onChange={(c) => set('quarterly', { ...s.quarterly, priorityIds: c ? [...s.quarterly.priorityIds, p.id] : s.quarterly.priorityIds.filter((x) => x !== p.id) })}
                >
                  <StatusGlyph status={statusToGlyph(p.status)} />
                  <span className="truncate">{p.title}</span>
                </Pick>
              ))}
              {!priorities.length && <span className="text-sm text-faint">No priorities this quarter</span>}
            </Section>
            <Section title={L.longTermIssues}>
              {issueOptions.map((i) => (
                <Pick
                  key={i.id}
                  checked={s.longTermIssueIds.includes(i.id)}
                  onChange={(c) => set('longTermIssueIds', c ? [...s.longTermIssueIds, i.id] : s.longTermIssueIds.filter((x) => x !== i.id))}
                >
                  {i.title}
                </Pick>
              ))}
              {!issueOptions.length && <span className="text-sm text-faint">No long-term issues yet</span>}
            </Section>
          </Col>
        </div>
      </div>
    </>
  )
}
