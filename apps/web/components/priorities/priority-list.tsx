'use client'

import { Avatar } from '@movara/ui/avatar'
import { cn } from '@movara/ui/cn'
import { ListRow, ListRowGroup } from '@movara/ui/list-row'
import { Meter } from '@movara/ui/meter'
import { fmtDate } from './format'
import { meterTone, PriorityGlyph } from './status'
import type { Labels, Option, PriorityItem } from './types'

export type Group = { key: string; label: string; items: PriorityItem[] }

/** Company-level first, then one group per team, then individual priorities without a team. */
export function groupPriorities(items: PriorityItem[], teams: Option[], companyLabel: string, individualLabel: string): Group[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]))
  const groups: Group[] = []
  const add = (key: string, label: string, it: PriorityItem) => {
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, label, items: [] }))
    g.items.push(it)
  }
  for (const it of items) {
    if (it.level === 'company') add('company', companyLabel, it)
    else if (it.teamId) add(`team:${it.teamId}`, teamName.get(it.teamId) ?? 'Team', it)
    else add('individual', individualLabel, it)
  }
  const rank = (g: Group) => (g.key === 'company' ? 0 : g.key === 'individual' ? 2 : 1)
  return groups.sort((a, b) => rank(a) - rank(b))
}

export function Summary({ items, weekText, labels }: { items: PriorityItem[]; weekText: string; labels: Labels }) {
  const live = items.filter((i) => i.status !== 'dropped')
  const on = live.filter((i) => i.status === 'on_track').length
  const done = live.filter((i) => i.status === 'done').length
  const off = live.filter((i) => i.status === 'off_track' || i.status === 'not_done').length
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[18px] gap-y-2 px-1 pb-[18px] pt-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-[650] leading-none tracking-[-0.03em] text-ink tabular-nums">{on + done}</span>
        <span className="text-base text-body">of {live.length} on track</span>
      </div>
      <div className="flex h-1.5 gap-[3px]" role="img" aria-label={`${on} ${labels.status.on_track}, ${done} ${labels.status.done}, ${off} ${labels.status.off_track}`}>
        {live.length === 0 ? <span className="flex-1 rounded-[3px] bg-well" /> : null}
        {on > 0 && <span style={{ flex: on }} className="rounded-[3px] bg-success" />}
        {done > 0 && <span style={{ flex: done }} className="rounded-[3px] bg-icon-faint" />}
        {off > 0 && <span style={{ flex: off }} className="rounded-[3px] bg-danger" />}
      </div>
      <span className="col-span-2 text-sm text-faint sm:col-span-1">{weekText}</span>
    </div>
  )
}

export function PriorityRows({
  groups,
  selectedId,
  onSelect,
  people,
  quarterStart,
}: {
  groups: Group[]
  selectedId: string | null
  onSelect: (id: string) => void
  people: Option[]
  quarterStart: string
}) {
  const person = new Map(people.map((p) => [p.id, p.name]))
  return (
    <div>
      {groups.map((g, gi) => (
        <section key={g.key}>
          {(groups.length > 1 || gi > 0) && <ListRowGroup className="mx-1" count={g.items.length}>{g.label}</ListRowGroup>}
          <div className="-mx-2 flex flex-col">
            {g.items.map((p, i) => {
              const owner = p.ownerId ? person.get(p.ownerId) : undefined
              const pct = p.milestonesTotal ? p.milestonesDone / p.milestonesTotal : p.status === 'done' ? 1 : 0
              return (
                <div key={p.id} className={cn(i > 0 && 'shadow-[inset_0_1px_0_var(--m-line-faint)]', selectedId === p.id && 'shadow-none', selectedId === g.items[i - 1]?.id && 'shadow-none')}>
                  <ListRow
                    data-priority-id={p.id}
                    selected={selectedId === p.id}
                    onClick={() => onSelect(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(p.id)
                      }
                    }}
                    leading={<PriorityGlyph status={p.status} />}
                    title={<span className={cn(p.status === 'dropped' && 'text-faint line-through')}>{p.title}</span>}
                    trailing={
                      <>
                        <span className="flex items-center gap-2">
                          <Meter value={pct} tone={meterTone(p.status)} className="w-11" />
                          <span className="min-w-[26px] text-xs tabular-nums text-body">{p.milestonesTotal ? `${p.milestonesDone}/${p.milestonesTotal}` : '–'}</span>
                        </span>
                        <span className="hidden w-[52px] text-right text-sm text-body tabular-nums sm:inline">{fmtDate(p.dueDate, quarterStart)}</span>
                        {owner ? <Avatar name={owner} size={20} /> : <span className="size-5 rounded-full border border-dashed border-icon-faint" title="No owner" />}
                      </>
                    }
                  />
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
