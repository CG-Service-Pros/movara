import { Avatar } from '@motion/ui/avatar'
import { AgentMark } from '@motion/ui/agent-mark'
import { cn } from '@motion/ui/cn'
import type { SeatDTO } from './types'

export function PeopleLine({ people }: { people: SeatDTO['people'] }) {
  if (!people.length)
    return (
      <div className="flex items-center gap-2 text-sm text-body">
        <span className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--m-icon-faint)]" />
        Open seat
      </div>
    )
  return (
    <div className="flex items-center gap-2 text-sm text-ink">
      <span className="flex shrink-0 -space-x-1.5">
        {people.slice(0, 3).map((p) => (
          <Avatar key={p.id} name={p.name} size={20} className="ring-2 ring-surface" />
        ))}
      </span>
      <span className="truncate">{people.map((p) => p.name).join(', ')}</span>
    </div>
  )
}

/** One seat: title, who sits in it (or "Open seat"), responsibilities, assisting agents, linked priority. */
export function SeatCard({ seat, priorityTitle, height, selected, className }: { seat: SeatDTO; priorityTitle?: string; height?: number; selected?: boolean; className?: string }) {
  const open = seat.people.length === 0
  return (
    <div
      data-seat={seat.id}
      data-open={open || undefined}
      style={{ height, ...(open ? { outline: '1.5px dashed var(--m-icon-faint)', outlineOffset: '-1.5px' } : null) }}
      className={cn(
        'flex flex-col rounded-xl bg-surface px-3.5 py-3 text-left shadow-[0_0_0_1px_var(--m-line),0_2px_6px_rgb(16_24_40/0.05)]',
        open && 'bg-canvas shadow-[0_0_0_1px_var(--m-line-faint)]',
        selected && 'shadow-[0_0_0_2px_var(--color-accent)]',
        className,
      )}
    >
      <div className="text-base font-[640] leading-[18px] text-ink">{seat.title}</div>
      <div className="mt-2">
        <PeopleLine people={seat.people} />
      </div>
      {seat.responsibilities.length > 0 && (
        <ul className="mt-2 flex list-none flex-col gap-[3px] border-t border-line-faint p-0 pt-2 text-xs text-body">
          {seat.responsibilities.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {seat.agents.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 border-t border-line-faint pt-2 text-xs text-body">
          <AgentMark size={16} className="mt-px" />
          <span>Assisted by {seat.agents.map((a) => a.name).join(', ')}</span>
        </div>
      )}
      {seat.linkedPriorityId && (
        <div className="mt-2 rounded-md bg-accent-soft px-2 py-1 text-xs font-[550] text-accent-text">Priority · {priorityTitle ?? 'linked'}</div>
      )}
    </div>
  )
}
