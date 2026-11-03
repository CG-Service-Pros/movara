'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Avatar } from '@movara/ui/avatar'
import { Button } from '@movara/ui/button'
import { controlClasses } from '@movara/ui/input'
import { Input } from '@movara/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@movara/ui/sheet'
import { toast } from '@movara/ui/toaster'
import { addChartSeat, deleteChartSeat, reorderChartSeats, saveChartSeat } from '@/app/(app)/[org]/chart/actions'
import { buildTree, type Named, type PriorityOpt, type SeatDTO } from './types'

function descendants(seats: SeatDTO[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (p: string) => seats.filter((s) => s.parentSeatId === p).forEach((s) => (out.add(s.id), walk(s.id)))
  walk(id)
  return out
}

const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.04em] text-faint'

export function SeatSheet({
  slug,
  revisionId,
  seat,
  seats,
  people,
  agents,
  priorities,
  seatLabel,
  onClose,
  onSelect,
}: {
  slug: string
  revisionId: string
  seat: SeatDTO | null
  seats: SeatDTO[]
  people: Named[]
  agents: Named[]
  priorities: PriorityOpt[]
  seatLabel: string
  onClose: () => void
  onSelect: (id: string) => void
}) {
  return (
    <Sheet open={!!seat} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[440px] overflow-auto">
        {seat && <SeatForm key={seat.id} {...{ slug, revisionId, seat, seats, people, agents, priorities, seatLabel, onClose, onSelect }} />}
      </SheetContent>
    </Sheet>
  )
}

function SeatForm({ slug, revisionId, seat, seats, people, agents, priorities, seatLabel, onClose, onSelect }: Omit<React.ComponentProps<typeof SeatSheet>, 'seat'> & { seat: SeatDTO }) {
  const router = useRouter()
  const [title, setTitle] = React.useState(seat.title)
  const [resp, setResp] = React.useState(seat.responsibilities)
  const [personIds, setPersonIds] = React.useState(seat.people.map((p) => p.id))
  const [agentIds, setAgentIds] = React.useState(seat.agents.map((a) => a.id))
  const [parent, setParent] = React.useState(seat.parentSeatId ?? '')
  const [prio, setPrio] = React.useState(seat.linkedPriorityId ?? '')
  const [busy, start] = React.useTransition()

  const blocked = descendants(seats, seat.id)
  const parentOptions = seats.filter((s) => s.id !== seat.id && !blocked.has(s.id))
  const siblings = seats.filter((s) => s.parentSeatId === seat.parentSeatId)
  const idx = siblings.findIndex((s) => s.id === seat.id)

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  const act = (fn: () => Promise<{ ok: boolean; error?: string; needsApproval?: boolean }>, done?: string, close = false) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.error ?? 'Something went wrong')
      if (done) toast(done)
      router.refresh()
      if (close) onClose()
    })

  const save = () =>
    act(
      () =>
        saveChartSeat(slug, seat.id, {
          title: title.trim() || seat.title,
          responsibilities: resp,
          personIds,
          agentIds,
          parentSeatId: parent || null,
          parentChanged: (parent || null) !== seat.parentSeatId,
          linkedPriorityId: prio || null,
        }),
      'Saved',
      true,
    )
  const reorder = (d: -1 | 1) => {
    const ids = siblings.map((s) => s.id)
    const j = idx + d
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j]!, ids[idx]!]
    act(() => reorderChartSeats(slug, revisionId, seat.parentSeatId, ids))
  }
  const addChild = () =>
    start(async () => {
      const r = await addChartSeat(slug, revisionId, seat.id, `New ${seatLabel.toLowerCase()}`)
      if (!r.ok) return void toast.error(r.error)
      router.refresh()
      onSelect(r.data!.id)
    })

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit {seatLabel.toLowerCase()}</SheetTitle>
        <SheetDescription>Changes apply to the draft. Publish the draft to make them live.</SheetDescription>
      </SheetHeader>
      <div className="-mx-1 flex flex-1 flex-col gap-4 overflow-auto px-1">
        <label className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Title</span>
          <Input aria-label="Seat title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <div className="flex flex-col gap-1">
          <span className={sectionLabel}>People</span>
          {people.map((p) => (
            <label key={p.id} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-base text-ink hover:bg-nav-active">
              <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={personIds.includes(p.id)} onChange={() => toggle(personIds, p.id, setPersonIds)} />
              <Avatar name={p.name} size={20} />
              {p.name}
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Responsibilities</span>
          {resp.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input aria-label={`Responsibility ${i + 1}`} value={r} onChange={(e) => setResp(resp.map((x, j) => (j === i ? e.target.value : x)))} placeholder="What this seat is accountable for" />
              <button type="button" aria-label="Remove responsibility" className="grid size-7 shrink-0 place-items-center rounded-md text-icon hover:bg-nav-active hover:text-ink" onClick={() => setResp(resp.filter((_, j) => j !== i))}>
                <X size={14} strokeWidth={1.7} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setResp([...resp, ''])} className="inline-flex h-6 w-fit items-center gap-1 rounded-md px-1.5 text-sm font-[550] text-accent-text hover:bg-accent-soft">
            <Plus size={13} strokeWidth={1.9} />
            Add responsibility
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className={sectionLabel}>Assisting agents</span>
          {agents.map((a) => (
            <label key={a.id} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-base text-ink hover:bg-nav-active">
              <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={agentIds.includes(a.id)} onChange={() => toggle(agentIds, a.id, setAgentIds)} />
              <AgentMark size={20} />
              {a.name}
            </label>
          ))}
          {!agents.length && <span className="text-sm text-faint">No agents connected yet.</span>}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Reports to</span>
          <select aria-label="Reports to" className={`${controlClasses} h-7 px-2`} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">No one (top {seatLabel.toLowerCase()})</option>
            {parentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Linked priority</span>
          <select aria-label="Linked priority" className={`${controlClasses} h-7 px-2`} value={prio} onChange={(e) => setPrio(e.target.value)}>
            <option value="">None</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className={sectionLabel}>Order</span>
          <Button size="sm" variant="secondary" disabled={busy || idx <= 0} onClick={() => reorder(-1)}>
            <ArrowLeft size={13} strokeWidth={1.7} /> Earlier
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || idx < 0 || idx >= siblings.length - 1} onClick={() => reorder(1)}>
            Later <ArrowRight size={13} strokeWidth={1.7} />
          </Button>
          <Button size="sm" variant="secondary" className="ml-auto" disabled={busy} onClick={addChild}>
            <Plus size={13} strokeWidth={1.7} /> Add child {seatLabel.toLowerCase()}
          </Button>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <Button
          variant="ghost"
          disabled={busy}
          className="text-danger-text"
          onClick={() => {
            if (window.confirm(`Delete "${seat.title}"? Its children move up a level.`)) act(() => deleteChartSeat(slug, seat.id), 'Seat deleted', true)
          }}
        >
          <Trash2 size={14} strokeWidth={1.7} /> Delete
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </>
  )
}

export { buildTree }
