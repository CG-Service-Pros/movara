'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { EmptyState } from '@movara/ui/empty-state'
import { Kbd } from '@movara/ui/kbd'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { toast } from '@movara/ui/toaster'
import { Page } from '@/components/shell/page'
import {
  addMilestoneAction,
  createPriorityAction,
  deleteMilestoneAction,
  deletePriorityAction,
  renameMilestoneAction,
  reorderMilestonesAction,
  setStatusAction,
  toggleMilestoneAction,
  updatePriorityAction,
} from '@/app/(app)/[org]/priorities/actions'
import { newRequestId, quarterLabel } from './format'
import { NewPriorityDialog, type NewPriorityInput } from './new-priority-dialog'
import { DetailSkeleton, PriorityDetail, type DetailApi } from './priority-detail'
import { groupPriorities, PriorityRows, Summary } from './priority-list'
import { STATUS_CYCLE, type ActionResult, type Labels, type Option, type PriorityDetailData, type PriorityItem, type PStatus, type Tab } from './types'
import { useCanWrite } from '@/components/shell/shell-context'
import { useOnChange } from '@/lib/use-on-change'

type Snap = { items: PriorityItem[]; detail: PriorityDetailData | null }
type Op =
  | { t: 'status'; id: string; status: PStatus }
  | { t: 'toggle'; id: string; done: boolean }
  | { t: 'reorder'; ids: string[] }

function reduce(s: Snap, op: Op): Snap {
  switch (op.t) {
    case 'status':
      return {
        items: s.items.map((i) => (i.id === op.id ? { ...i, status: op.status } : i)),
        detail: s.detail?.id === op.id ? { ...s.detail, status: op.status } : s.detail,
      }
    case 'toggle': {
      const d = s.detail
      if (!d) return s
      const milestones = d.milestones.map((m) => (m.id === op.id ? { ...m, done: op.done } : m))
      const doneN = milestones.filter((m) => m.done).length
      return { items: s.items.map((i) => (i.id === d.id ? { ...i, milestonesDone: doneN } : i)), detail: { ...d, milestones } }
    }
    case 'reorder': {
      const d = s.detail
      if (!d) return s
      const by = new Map(d.milestones.map((m) => [m.id, m]))
      return { ...s, detail: { ...d, milestones: op.ids.map((id) => by.get(id)!).filter(Boolean) } }
    }
  }
}

export type PrioritiesViewProps = {
  orgSlug: string
  quarter: string
  prevQuarter: string
  nextQuarter: string
  currentQuarter: string
  quarterEnd: string
  week: { week: number; of: number } | null
  tab: Tab
  teamId: string | null
  selectedId: string | null
  /** Deep link `?new=1`: open the create dialog on load. */
  openNew?: boolean
  items: PriorityItem[]
  detail: PriorityDetailData | null
  people: Option[]
  teams: Option[]
  meId: string
  labels: Labels
}

const ALL = 'all'

export function PrioritiesView(props: PrioritiesViewProps) {
  const canWrite = useCanWrite()
  const { orgSlug, quarter, tab, teamId, labels, people, teams } = props
  const router = useRouter()
  const [snap, apply] = React.useOptimistic<Snap, Op>({ items: props.items, detail: props.detail }, reduce)
  const [, startTransition] = React.useTransition()
  const [navPending, startNav] = React.useTransition()
  const [sel, setSel] = React.useState<string | null>(props.selectedId)
  const [creating, setCreating] = React.useState(!!props.openNew)

  useOnChange(props.selectedId, (id) => setSel(id))

  const groups = React.useMemo(() => groupPriorities(snap.items, teams, 'Company', 'Individual'), [snap.items, teams])
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups])
  const quarterStart = `${quarter.slice(0, 4)}-01-01`

  const url = React.useCallback(
    (o: { q?: string; tab?: Tab; team?: string | null; id?: string | null }) => {
      const sp = new URLSearchParams()
      const q = o.q ?? quarter
      if (q !== props.currentQuarter) sp.set('q', q)
      const t = o.tab ?? tab
      if (t !== 'company') sp.set('tab', t)
      const team = o.team === undefined ? teamId : o.team
      if (team && t === 'team') sp.set('team', team)
      const id = o.id === undefined ? sel : o.id
      if (id) sp.set('id', id)
      const s = sp.toString()
      return `/${orgSlug}/priorities${s ? `?${s}` : ''}`
    },
    [orgSlug, quarter, tab, teamId, sel, props.currentQuarter],
  )

  const go = (href: string) => startNav(() => router.replace(href, { scroll: false }))
  const select = React.useCallback(
    (id: string | null) => {
      setSel(id)
      go(url({ id }))
      if (id) requestAnimationFrame(() => document.querySelector(`[data-priority-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url],
  )

  // Desktop: always have a selection so the detail pane is never empty.
  // Navigation only: the selection follows the URL (props.selectedId) once it updates.
  React.useEffect(() => {
    if (!props.selectedId && !sel && flat[0] && window.matchMedia('(min-width: 1024px)').matches) go(url({ id: flat[0].id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat.length, props.selectedId])

  function report(r: ActionResult<unknown>) {
    if (!r.ok) toast.error(r.error)
    else if (r.message) toast(r.message)
  }
  /** Optimistically apply `op`, run the action, surface errors. The refreshed server data replaces the optimistic state. */
  const mutate = React.useCallback(
    (op: Op | null, fn: (requestId: string) => Promise<ActionResult<unknown>>) => {
      startTransition(async () => {
        if (op) apply(op)
        report(await fn(newRequestId()))
      })
    },
    [apply],
  )

  const setStatus = React.useCallback(
    (id: string, status: PStatus) => mutate({ t: 'status', id, status }, (rid) => setStatusAction(orgSlug, id, status, rid)),
    [mutate, orgSlug],
  )

  const api: DetailApi | null = snap.detail
    ? (() => {
        const d = snap.detail
        return {
          setStatus: (s) => setStatus(d.id, s),
          update: (patch) => mutate(null, (rid) => updatePriorityAction(orgSlug, d.id, patch, rid)),
          toggle: (id, done) => mutate({ t: 'toggle', id, done }, (rid) => toggleMilestoneAction(orgSlug, id, done, rid)),
          add: (title) => mutate(null, (rid) => addMilestoneAction(orgSlug, d.id, title, rid)),
          rename: (id, title) => mutate(null, (rid) => renameMilestoneAction(orgSlug, id, title, rid)),
          remove: (id) => mutate(null, (rid) => deleteMilestoneAction(orgSlug, id, rid)),
          move: (id, dir) => {
            const ids = d.milestones.map((m) => m.id)
            const i = ids.indexOf(id)
            const j = i + dir
            if (i < 0 || j < 0 || j >= ids.length) return
            ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
            mutate({ t: 'reorder', ids }, (rid) => reorderMilestonesAction(orgSlug, d.id, ids, rid))
          },
          deletePriority: async () => {
            const r = await deletePriorityAction(orgSlug, d.id, newRequestId())
            report(r)
            if (r.ok) {
              toast.success(`${labels.priority.singular} deleted`)
              setSel(null)
              go(url({ id: null }))
            }
          },
          open: (id) => select(id),
        }
      })()
    : null

  // Keyboard: j/k move, s cycles status, n creates.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="menu"]') || document.querySelector('[role="dialog"]'))) return
      const i = flat.findIndex((p) => p.id === sel)
      if (e.key === 'j' || e.key === 'k') {
        if (!flat.length) return
        e.preventDefault()
        const n = e.key === 'j' ? Math.min(flat.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
        select(flat[n]!.id)
      } else if (e.key === 's' && i >= 0 && canWrite) {
        e.preventDefault()
        const cur = flat[i]!
        const idx = STATUS_CYCLE.indexOf(cur.status)
        setStatus(cur.id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!)
      } else if (e.key === 'n' && canWrite) {
        e.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flat, sel, select, setStatus, canWrite])

  async function create(input: NewPriorityInput): Promise<string | null> {
    const r = await createPriorityAction(orgSlug, { ...input, quarter }, newRequestId())
    if (!r.ok) throw new Error(r.error)
    setCreating(false)
    toast.success(`${labels.priority.singular} created`)
    if (r.data) {
      setSel(r.data)
      go(url({ id: r.data }))
    }
    return null
  }

  const p = labels.priority
  const isCurrent = quarter === props.currentQuarter
  const weekText = props.week ? `Week ${props.week.week} of ${props.week.of}` : quarter < props.currentQuarter ? 'Completed quarter' : 'Upcoming quarter'
  const tabs = (
    <Segmented<Tab>
      aria-label="View"
      value={tab}
      onValueChange={(v) => go(url({ tab: v, id: null }))}
      options={[
        { value: 'company', label: 'Company' },
        { value: 'team', label: labels.team },
        { value: 'mine', label: 'Mine' },
      ]}
    />
  )
  const teamFilter =
    tab === 'team' ? (
      <Select value={teamId ?? ALL} onValueChange={(v) => go(url({ team: v === ALL ? null : v, id: null }))}>
        <SelectTrigger aria-label={`Filter by ${labels.team.toLowerCase()}`} className="h-6 w-auto min-w-[120px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {labels.team.toLowerCase()}s</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  const detailVisible = snap.detail && snap.detail.id === sel
  const showPane = !!sel

  return (
    <Page
      title={p.plural}
      meta={
        <>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-6" aria-label="Previous quarter" onClick={() => go(url({ q: props.prevQuarter, id: null }))}>
              <ChevronLeft size={14} strokeWidth={1.8} />
            </Button>
            <span className="min-w-[58px] text-center tabular-nums text-ink">{quarterLabel(quarter)}</span>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Next quarter" onClick={() => go(url({ q: props.nextQuarter, id: null }))}>
              <ChevronRight size={14} strokeWidth={1.8} />
            </Button>
          </div>
          {!isCurrent && (
            <button type="button" onClick={() => go(url({ q: props.currentQuarter, id: null }))} className="hidden text-sm font-[500] text-accent-text hover:underline sm:inline">
              Today
            </button>
          )}
        </>
      }
      tabs={
        <div className="hidden items-center gap-2 md:flex">
          {tabs}
          {teamFilter}
        </div>
      }
      actions={
        canWrite ? (
          <Button variant="primary" onClick={() => setCreating(true)} aria-label={`New ${p.singular.toLowerCase()}`}>
            <Plus size={14} strokeWidth={2} />
            <span className="max-sm:hidden">New {p.singular.toLowerCase()}</span>
          </Button>
        ) : undefined
      }
      bodyClassName="flex flex-col overflow-hidden"
    >
      <div className={cn('flex items-center gap-2 border-b border-line-faint px-4 py-2 md:hidden', showPane && 'max-lg:hidden')}>
        {tabs}
        {teamFilter}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cn('min-h-0 overflow-auto px-5 pb-8 pt-5', navPending && 'opacity-90', showPane && 'max-lg:hidden')}>
          {snap.items.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title={`No ${p.plural.toLowerCase()} here yet`}
              description={tab === 'mine' ? `Nothing is assigned to you in ${quarterLabel(quarter)}.` : `Add the few ${p.plural.toLowerCase()} that matter most in ${quarterLabel(quarter)}.`}
              action={
                canWrite ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus size={14} strokeWidth={2} /> New {p.singular.toLowerCase()}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Summary items={snap.items} weekText={weekText} labels={labels} />
              <PriorityRows groups={groups} selectedId={sel} onSelect={select} people={people} quarterStart={quarterStart} />
              <p className="mt-6 hidden text-xs text-faint lg:block">
                <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>S</Kbd> cycle status · <Kbd>N</Kbd> new
              </p>
            </>
          )}
        </div>
        <aside className={cn('min-h-0 min-w-0 flex-col border-l border-line', showPane ? 'flex' : 'hidden lg:flex')} aria-label={`${p.singular} details`}>
          {detailVisible && api ? (
            <div className={cn('flex min-h-0 flex-1 flex-col', navPending && 'opacity-70')}>
              <PriorityDetail d={snap.detail!} labels={labels} people={people} teams={teams} api={api} onBack={() => select(null)} quarterStart={quarterStart} />
            </div>
          ) : sel ? (
            <DetailSkeleton />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-faint">
              Select a {p.singular.toLowerCase()} to see its {labels.milestone.plural.toLowerCase()} and activity.
            </div>
          )}
        </aside>
      </div>
      <NewPriorityDialog
        open={creating}
        onOpenChange={setCreating}
        labels={labels}
        people={people}
        teams={teams}
        defaults={{ ownerId: props.meId, teamId: tab === 'team' ? teamId : null, level: tab === 'team' ? 'team' : tab === 'mine' ? 'individual' : 'company', dueDate: props.quarterEnd }}
        onCreate={create}
      />
    </Page>
  )
}
