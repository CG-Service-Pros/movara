'use client'

import * as React from 'react'
import { CalendarDays, CheckSquare, Plus, Trash2 } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { Badge } from '@movara/ui/badge'
import { Checkbox } from '@movara/ui/checkbox'
import { Input } from '@movara/ui/input'
import { Textarea } from '@movara/ui/textarea'
import { Field } from '@movara/ui/field'
import { EmptyState } from '@movara/ui/empty-state'
import { AgentMark } from '@movara/ui/agent-mark'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@movara/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Tip } from '@movara/ui/tooltip'
import { cn } from '@movara/ui/cn'
import { addDaysStr, daysBetween, OwnerPicker, PersonChip, shortDate, SourceChip, useAct, type PersonLite, type SourceInfo, type TeamLite } from '../issues/common'
import { createTodosAction, deleteTodoAction, setTodoDoneAction, updateTodoAction } from '@/app/(app)/[org]/todos/actions'
import { useCanWrite } from '@/components/shell/shell-context'
import { useOnChange } from '@/lib/use-on-change'

export type TodoItem = {
  id: string
  title: string
  description: string | null
  ownerId: string | null
  teamId: string | null
  dueDate: string | null
  status: 'open' | 'pending' | 'done'
  doneAt: string | null
  source: SourceInfo | null
  actorAgent: boolean
}
type View = 'my' | 'team' | 'all'

export function TodosView({
  orgSlug, todos, people, teams, myTeamIds, meId, today, liveTeamIds, initialView, labels, initialSelectedId = null, openNew = false,
}: {
  orgSlug: string
  todos: TodoItem[]
  people: PersonLite[]
  teams: TeamLite[]
  myTeamIds: string[]
  meId: string
  today: string
  liveTeamIds: string[]
  initialView: View
  labels: { todo: string; todos: string }
  /** Deep links: `?id=<todoId>` opens its sheet, `?new=1` opens the create dialog. */
  initialSelectedId?: string | null
  openNew?: boolean
}) {
  const { act } = useAct()
  const [view, setView] = React.useState<View>(initialView)
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId)
  const [creating, setCreating] = React.useState(openNew)
  const canWrite = useCanWrite()
  const person = (id: string | null) => people.find((p) => p.id === id) ?? null
  const teamName = (id: string | null) => (id ? (teams.find((t) => t.id === id)?.name ?? null) : null)

  const inView = todos.filter((t) => (view === 'my' ? t.ownerId === meId : view === 'team' ? !!t.teamId && myTeamIds.includes(t.teamId) : true))
  const openRows = inView.filter((t) => t.status !== 'done')
  const doneRows = inView.filter((t) => t.status === 'done').slice(-15).reverse()
  const overdueCount = openRows.filter((t) => t.dueDate && t.dueDate < today).length
  const selected = todos.find((t) => t.id === selectedId) ?? null

  const toggle = (t: TodoItem) => {
    const done = t.status === 'open'
    const live = !!t.teamId && liveTeamIds.includes(t.teamId)
    act(() => setTodoDoneAction(orgSlug, t.id, done), { success: done ? (live ? 'Done · pending meeting' : 'Marked done') : 'Reopened' })
  }

  const row = (t: TodoItem) => {
    const overdue = t.status === 'open' && !!t.dueDate && t.dueDate < today
    const dueIn = t.dueDate ? daysBetween(today, t.dueDate) : null
    return (
      <li key={t.id} className="group border-b border-line-faint last:border-0">
        <div className="flex min-h-[46px] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-canvas">
          <Checkbox checked={t.status !== 'open'} disabled={!canWrite} aria-label={`${t.status === 'open' ? 'Mark done' : 'Mark not done'}: ${t.title}`} onCheckedChange={() => toggle(t)} className={t.status === 'pending' ? 'data-[state=checked]:bg-warning' : undefined} />
          <button type="button" onClick={() => setSelectedId(t.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <span className="flex items-center gap-1.5">
              <span className={cn('truncate text-base font-[500]', t.status === 'done' ? 'text-faint line-through' : 'text-ink')}>{t.title}</span>
              {t.actorAgent && <Tip label="Added by an agent"><span className="inline-flex"><AgentMark size={14} /></span></Tip>}
              {t.status === 'pending' && <Badge tone="warning">Done · pending meeting</Badge>}
            </span>
            {(t.source || (view !== 'my' && teamName(t.teamId))) && (
              <span className="flex items-center gap-1.5">
                <SourceChip source={t.source} />
                {view !== 'my' && teamName(t.teamId) && <span className="text-xs text-faint">{teamName(t.teamId)}</span>}
              </span>
            )}
          </button>
          {t.dueDate && (
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-[550] tabular-nums', overdue ? 'bg-danger-soft text-danger-text' : 'text-body')} title={t.dueDate}>
              {overdue ? `Overdue · ${shortDate(t.dueDate)}` : dueIn === 0 ? 'Today' : dueIn === 1 ? 'Tomorrow' : shortDate(t.dueDate)}
            </span>
          )}
          <PersonChip person={person(t.ownerId)} />
        </div>
      </li>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        {/* A view filter, not tab panels: a radio group keeps the ARIA honest. */}
        <Segmented<View> aria-label="Show" value={view} onValueChange={setView} options={[
          { value: 'my', label: `My ${labels.todos.toLowerCase()}` },
          { value: 'team', label: 'Team' },
          { value: 'all', label: 'All' },
        ]} />
        {overdueCount > 0 && <Badge tone="danger">{overdueCount} overdue</Badge>}
        {canWrite && <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}><Plus size={14} strokeWidth={2} />New {labels.todo.toLowerCase()}</Button>}
      </div>

      {openRows.length === 0 && doneRows.length === 0 ? (
        <EmptyState icon={<CheckSquare />} title={`No ${labels.todos.toLowerCase()} here`} description={view === 'my' ? 'Nothing assigned to you. Enjoy the quiet or add one.' : 'Nothing to track yet.'} action={canWrite ? <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} strokeWidth={2} />New {labels.todo.toLowerCase()}</Button> : undefined} />
      ) : (
        <>
          {openRows.length === 0 ? <p className="px-2 py-6 text-center text-base text-body">All caught up.</p> : <ul className="flex flex-col">{openRows.map(row)}</ul>}
          {doneRows.length > 0 && (
            <>
              <div className="mx-2 mt-4 text-xs font-semibold uppercase tracking-[0.04em] text-faint">Done</div>
              <ul className="flex flex-col">{doneRows.map(row)}</ul>
            </>
          )}
        </>
      )}

      <TodoSheet key={selected?.id ?? 'none'} orgSlug={orgSlug} todo={selected} people={people} teams={teams} onClose={() => setSelectedId(null)} labels={labels} />
      <NewTodoDialog open={creating} onOpenChange={setCreating} orgSlug={orgSlug} people={people} teams={teams} defaultOwners={[meId]} defaultTeamId={null} today={today} labels={labels} />
    </div>
  )
}

function TodoSheet({ orgSlug, todo, people, teams, onClose, labels }: { orgSlug: string; todo: TodoItem | null; people: PersonLite[]; teams: TeamLite[]; onClose: () => void; labels: { todo: string } }) {
  const { act, pending } = useAct()
  const canWrite = useCanWrite()
  const [title, setTitle] = React.useState(todo?.title ?? '')
  const [description, setDescription] = React.useState(todo?.description ?? '')
  const [ownerId, setOwnerId] = React.useState<string | null>(todo?.ownerId ?? null)
  const [teamId, setTeamId] = React.useState<string>(todo?.teamId ?? 'none')
  const [due, setDue] = React.useState(todo?.dueDate ?? '')
  const dirty = todo ? title !== todo.title || description !== (todo.description ?? '') || ownerId !== todo.ownerId || (teamId === 'none' ? null : teamId) !== todo.teamId || (due || null) !== todo.dueDate : false
  return (
    <Sheet open={!!todo} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        {todo && (
          <fieldset disabled={!canWrite} className="contents">
            <SheetHeader>
              <SheetTitle>{labels.todo}</SheetTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {todo.status === 'pending' && <Badge tone="warning">Done · pending meeting</Badge>}
                {todo.status === 'done' && <Badge tone="success">Done</Badge>}
                <SourceChip source={todo.source} />
              </div>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-3 overflow-auto">
              <Field label="Title" htmlFor="td-title"><Input id="td-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Notes" htmlFor="td-desc"><Textarea id="td-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner"><OwnerPicker single people={people} value={ownerId ? [ownerId] : []} onChange={(ids) => setOwnerId(ids[0] ?? null)} /></Field>
                <Field label="Due" htmlFor="td-due"><Input id="td-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              </div>
              <Field label="Team">
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Personal</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <SheetFooter className="justify-between">
              <Button variant="ghost" className="text-danger-text" onClick={() => act(() => deleteTodoAction(orgSlug, todo.id), { success: 'Deleted', onDone: onClose })}><Trash2 size={14} strokeWidth={1.8} />Delete</Button>
              <Button variant="primary" disabled={!dirty || !title.trim()} loading={pending} onClick={() => act(() => updateTodoAction(orgSlug, { todoId: todo.id, title: title.trim(), description: description.trim() || null, ownerId, teamId: teamId === 'none' ? null : teamId, dueDate: due || null }), { success: 'Saved', onDone: onClose })}>Save changes</Button>
            </SheetFooter>
          </fieldset>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function NewTodoDialog({
  open, onOpenChange, orgSlug, people, teams, defaultOwners, defaultTeamId, today, labels, source, initialTitle,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orgSlug: string
  people: PersonLite[]
  teams: TeamLite[]
  defaultOwners: string[]
  defaultTeamId: string | null
  today: string
  labels: { todo: string }
  source?: { type: string; id: string } | null
  initialTitle?: string
}) {
  const { act, pending } = useAct()
  const [title, setTitle] = React.useState(initialTitle ?? '')
  const [owners, setOwners] = React.useState<string[]>(defaultOwners)
  const [team, setTeam] = React.useState<string>(defaultTeamId ?? 'none')
  const [due, setDue] = React.useState(addDaysStr(today, 7))
  useOnChange(open, (o) => { if (o) { setTitle(initialTitle ?? ''); setOwners(defaultOwners); setTeam(defaultTeamId ?? 'none'); setDue(addDaysStr(today, 7)) } })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    act(() => createTodosAction(orgSlug, { title: title.trim(), ownerIds: owners, teamId: team === 'none' ? null : team, dueDate: due, source }), {
      success: owners.length > 1 ? `Created ${owners.length} ${labels.todo.toLowerCase()}s` : `${labels.todo} created`,
      onDone: () => onOpenChange(false),
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New {labels.todo.toLowerCase()}</DialogTitle>
            <DialogDescription>Add several owners to give each of them their own copy.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="nt-title"><Input id="nt-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to get done?" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owners"><OwnerPicker people={people} value={owners} onChange={setOwners} /></Field>
            <Field label="Due" htmlFor="nt-due" hint="Default is seven days out."><Input id="nt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label="Team">
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Personal</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!title.trim() || owners.length === 0}><CalendarDays size={14} strokeWidth={1.8} />Create {labels.todo.toLowerCase()}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
