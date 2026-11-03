'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, List, Minus, Network, Pencil, Plus } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { EmptyState } from '@movara/ui/empty-state'
import { PageHeader } from '@movara/ui/page-header'
import { Segmented } from '@movara/ui/segmented'
import { toast } from '@movara/ui/toaster'
import { addChartSeat, createChartDraft, discardChartDraft, publishChartDraft } from '@/app/(app)/[org]/chart/actions'
import { PeopleLine, SeatCard } from './seat-card'
import { SeatSheet } from './seat-sheet'
import { buildTree, CARD_W, layoutTree, type Named, type PriorityOpt, type SeatDTO, type TreeNode } from './types'

const ZOOMS = [50, 75, 100, 125, 150]

export function ChartWorkspace({
  slug,
  title,
  seatLabel,
  mode,
  revisionId,
  number,
  versionText,
  seats,
  people,
  agents,
  priorities,
  canPublish,
  hasDraft,
  canEdit,
}: {
  slug: string
  title: string
  seatLabel: string
  mode: 'view' | 'edit'
  revisionId: string
  number: number
  versionText: string
  seats: SeatDTO[]
  people: Named[]
  agents: Named[]
  priorities: PriorityOpt[]
  canPublish: boolean
  hasDraft: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const edit = mode === 'edit'
  const [view, setView] = React.useState<'chart' | 'list'>('chart')
  const [zoom, setZoom] = React.useState(100)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [busy, start] = React.useTransition()
  const roots = React.useMemo(() => buildTree(seats), [seats])
  const layout = React.useMemo(() => layoutTree(roots), [roots])
  const prioTitle = React.useMemo(() => new Map(priorities.map((p) => [p.id, p.title])), [priorities])
  const selectedSeat = seats.find((s) => s.id === selected) ?? null

  const call = (fn: () => Promise<{ ok: boolean; error?: string; needsApproval?: boolean }>, after?: () => void, msg?: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.error ?? 'Something went wrong')
      if (r.needsApproval) toast('Sent for approval')
      else if (msg) toast(msg)
      after?.()
    })

  const addSeat = (parentId: string | null) =>
    start(async () => {
      const r = await addChartSeat(slug, revisionId, parentId, `New ${seatLabel.toLowerCase()}`)
      if (!r.ok) return void toast.error(r.error)
      router.refresh()
      setSelected(r.data!.id)
    })

  const startDraft = (from: 'published' | 'blank' | 'template') => call(() => createChartDraft(slug, from), () => router.push(`/${slug}/chart?edit=1`))

  const header = (
    <PageHeader
      data-print-hide
      title={title}
      meta={edit ? <Badge tone="warning">Draft v{number}</Badge> : <Badge>{versionText}</Badge>}
      tabs={
        <Segmented
          aria-label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'chart', label: 'Chart', icon: <Network /> },
            { value: 'list', label: 'List', icon: <List /> },
          ]}
        />
      }
      actions={
        edit ? (
          <>
            <Button variant="ghost" asChild>
              <Link href={`/${slug}/chart`}>
                <ArrowLeft size={14} strokeWidth={1.7} />
                Back to published
              </Link>
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Discard this draft? Your edits will be lost.')) call(() => discardChartDraft(slug, revisionId), () => (router.push(`/${slug}/chart`), router.refresh()), 'Draft discarded')
              }}
            >
              Discard draft
            </Button>
            {canPublish ? (
              <Button variant="primary" loading={busy} onClick={() => call(() => publishChartDraft(slug, revisionId), () => (router.push(`/${slug}/chart`), router.refresh()), `Published v${number}`)}>
                Publish
              </Button>
            ) : (
              <span className="text-sm text-body">Admins publish drafts</span>
            )}
          </>
        ) : (
          canEdit && (
            <>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => (hasDraft ? router.push(`/${slug}/chart?edit=1`) : startDraft('published'))}
              >
                <Pencil size={14} strokeWidth={1.7} />
                {hasDraft ? 'Continue draft' : 'Edit draft'}
              </Button>
              {!hasDraft && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" aria-label="Start a different draft">
                      <ChevronDown size={14} strokeWidth={1.7} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => startDraft('blank')}>Start from a blank chart</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startDraft('template')}>Start from the standard template</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )
        )
      }
    />
  )

  const wrapperW = layout.width * (zoom / 100)
  const wrapperH = layout.height * (zoom / 100)

  return (
    <>
      {header}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {seats.length === 0 ? (
          <EmptyState
            title={`No ${seatLabel.toLowerCase()}s yet`}
            description={edit ? `Start with the top ${seatLabel.toLowerCase()}, then add the ones that report to it.` : undefined}
            action={edit ? <Button variant="primary" loading={busy} onClick={() => addSeat(null)}>Add the top {seatLabel.toLowerCase()}</Button> : undefined}
          />
        ) : view === 'chart' ? (
          <>
            <div
              data-testid="chart-canvas"
              tabIndex={0}
              aria-label="Accountability chart canvas"
              className="h-full overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
              style={{ backgroundImage: 'radial-gradient(circle, var(--m-line) 1px, transparent 1.3px)', backgroundSize: '16px 16px' }}
            >
              <div className="mx-auto" style={{ width: wrapperW, height: wrapperH }}>
                <div className="relative origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom / 100})` }}>
                  <svg className="absolute inset-0 text-icon-faint" width={layout.width} height={layout.height} aria-hidden>
                    {layout.edges.map((e) => {
                      const px = e.from.x + CARD_W / 2
                      const y0 = e.from.y + e.from.h
                      const midY = y0 + (e.to[0]!.y - y0) / 2
                      const xs = e.to.map((c) => c.x + CARD_W / 2)
                      return (
                        <path
                          key={e.from.node.id}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          d={`M${px} ${y0}V${midY}M${Math.min(...xs, px)} ${midY}H${Math.max(...xs, px)}${xs.map((x) => `M${x} ${midY}V${e.to[0]!.y}`).join('')}`}
                        />
                      )
                    })}
                  </svg>
                  {layout.placed.map((p) => {
                    const card = (
                      <SeatCard seat={p.node} height={p.h} priorityTitle={p.node.linkedPriorityId ? prioTitle.get(p.node.linkedPriorityId) : undefined} selected={selected === p.node.id} />
                    )
                    return (
                      <div key={p.node.id} className="absolute" style={{ left: p.x, top: p.y, width: CARD_W }}>
                        {edit ? (
                          <button type="button" aria-label={`Edit ${p.node.title}`} onClick={() => setSelected(p.node.id)} className="block w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                            {card}
                          </button>
                        ) : (
                          card
                        )}
                        {edit && (
                          <button
                            type="button"
                            aria-label={`Add ${seatLabel.toLowerCase()} under ${p.node.title}`}
                            disabled={busy}
                            onClick={() => addSeat(p.node.id)}
                            className="absolute left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-surface text-icon shadow-[0_0_0_1px_var(--m-line)] outline-none hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent/50"
                            style={{ top: p.h + 4 }}
                          >
                            <Plus size={12} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg bg-surface p-0.5 shadow-pop">
              <Button size="icon" variant="ghost" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]!} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]!)}>
                <Minus size={14} strokeWidth={1.7} />
              </Button>
              <button type="button" aria-label={`${zoom}%, reset zoom`} className="h-7 min-w-11 rounded-md px-1 text-sm font-[550] text-body tabular-nums hover:bg-nav-active" onClick={() => setZoom(100)}>
                {zoom}%
              </button>
              <Button size="icon" variant="ghost" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]!} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]!)}>
                <Plus size={14} strokeWidth={1.7} />
              </Button>
            </div>
          </>
        ) : (
          <div className="h-full overflow-auto px-6 py-4">
            <div className="mx-auto max-w-[1100px]" data-testid="chart-list">
              {roots.map((r) => (
                <ListRow key={r.id} node={r} edit={edit} onPick={setSelected} prioTitle={prioTitle} />
              ))}
            </div>
          </div>
        )}
      </div>
      {edit && (
        <SeatSheet slug={slug} revisionId={revisionId} seat={selectedSeat} seats={seats} people={people} agents={agents} priorities={priorities} seatLabel={seatLabel} onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </>
  )
}

function ListRow({ node, edit, onPick, prioTitle }: { node: TreeNode; edit: boolean; onPick: (id: string) => void; prioTitle: Map<string, string> }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-ink">{node.title}</div>
        {node.responsibilities.length > 0 && <div className="truncate text-sm text-body">{node.responsibilities.join(' · ')}</div>}
      </div>
      {node.agents.length > 0 && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-body">
          <AgentMark size={16} />
          {node.agents.map((a) => a.name).join(', ')}
        </span>
      )}
      {node.linkedPriorityId && <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-[550] text-accent-text">Priority · {prioTitle.get(node.linkedPriorityId) ?? 'linked'}</span>}
      <div className="w-48 shrink-0">
        <PeopleLine people={node.people} />
      </div>
    </>
  )
  return (
    <div>
      {edit ? (
        <button type="button" onClick={() => onPick(node.id)} style={{ paddingLeft: node.depth * 24 }} className="flex w-full items-center gap-3 border-b border-line-faint py-2.5 text-left outline-none hover:bg-nav-active focus-visible:ring-2 focus-visible:ring-accent/50">
          {inner}
        </button>
      ) : (
        <div style={{ paddingLeft: node.depth * 24 }} className="flex items-center gap-3 border-b border-line-faint py-2.5">
          {inner}
        </div>
      )}
      {node.children.map((c) => (
        <ListRow key={c.id} node={c} edit={edit} onPick={onPick} prioTitle={prioTitle} />
      ))}
    </div>
  )
}

/** Empty-state actions: pick how to start the first draft. */
export function StartChart({ slug }: { slug: string; seatLabel: string }) {
  const router = useRouter()
  const [busy, start] = React.useTransition()
  const go = (from: 'blank' | 'template') =>
    start(async () => {
      const r = await createChartDraft(slug, from)
      if (!r.ok) return void toast.error(r.error)
      router.push(`/${slug}/chart?edit=1`)
    })
  return (
    <div className="flex gap-2">
      <Button variant="primary" loading={busy} onClick={() => go('template')}>
        Start from the standard template
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => go('blank')}>
        Start blank
      </Button>
    </div>
  )
}
