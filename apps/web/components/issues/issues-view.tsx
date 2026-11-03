'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, CheckCircle2, Plus, RotateCcw, Trash2, ListChecks } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { Badge } from '@movara/ui/badge'
import { Input } from '@movara/ui/input'
import { Textarea } from '@movara/ui/textarea'
import { Field } from '@movara/ui/field'
import { EmptyState } from '@movara/ui/empty-state'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@movara/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Tip } from '@movara/ui/tooltip'
import { cn } from '@movara/ui/cn'
import { AgentMark } from '@movara/ui/agent-mark'
import { ageLabel, OwnerPicker, PersonChip, SourceChip, useAct, type PersonLite, type SourceInfo, type TeamLite } from './common'
import { createIssuesAction, issueStateAction, moveIssueAction, setIssueRankAction, updateIssueAction } from '@/app/(app)/[org]/issues/actions'
import { useCanWrite } from '@/components/shell/shell-context'
import { useOnChange } from '@/lib/use-on-change'

export type IssueItem = {
  id: string
  title: string
  description: string | null
  ownerId: string | null
  teamId: string | null
  horizon: 'short' | 'long'
  rank: number
  status: 'open' | 'solved' | 'dropped'
  createdAt: string
  solvedAt: string | null
  source: { type: string; id: string } | null
  actorAgent: boolean
}
type Tab = 'short' | 'long' | 'solved'

export function IssuesView({
  orgSlug, issues, solved, sources, people, teams, teamId, initialTab, now, labels, initialSelectedId = null, openNew = false,
}: {
  orgSlug: string
  issues: IssueItem[]
  solved: IssueItem[]
  sources: Record<string, SourceInfo | null>
  people: PersonLite[]
  teams: TeamLite[]
  teamId: string | null
  initialTab: Tab
  now: string
  labels: { issue: string; issues: string; solve: string }
  /** Deep links: `?id=<issueId>` opens its sheet, `?new=1` opens the create dialog. */
  initialSelectedId?: string | null
  openNew?: boolean
}) {
  const router = useRouter()
  const { act } = useAct()
  const [tab, setTab] = React.useState<Tab>(initialTab)
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId)
  const [creating, setCreating] = React.useState(openNew)
  const canWrite = useCanWrite()
  const personOf = (id: string | null) => people.find((p) => p.id === id) ?? null

  const short = issues.filter((i) => i.horizon === 'short')
  const long = issues.filter((i) => i.horizon === 'long')
  const list = tab === 'short' ? short : tab === 'long' ? long : solved
  const all = [...issues, ...solved]
  const selected = all.find((i) => i.id === selectedId) ?? null
  const canRank = tab !== 'solved' && teamId !== null

  const move = (index: number, dir: -1 | 1) => {
    const target = list[index + dir]
    if (!target) return
    act(() => setIssueRankAction(orgSlug, list[index]!.id, target.rank))
  }

  return (
    <div className="flex w-full flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab> aria-label="Show" value={tab} onValueChange={setTab} options={[
          { value: 'short', label: <>Short-term <span className="text-faint">{short.length}</span></> },
          { value: 'long', label: <>Long-term <span className="text-faint">{long.length}</span></> },
          { value: 'solved', label: <>Solved <span className="text-faint">{solved.length}</span></> },
        ]} />
        <div className="ml-auto flex items-center gap-2">
          <Select value={teamId ?? 'all'} onValueChange={(v) => router.push(`?team=${v}`)}>
            <SelectTrigger className="w-44" aria-label="Team"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} strokeWidth={2} />New {labels.issue.toLowerCase()}</Button>}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={tab === 'solved' ? `No solved ${labels.issues.toLowerCase()} yet` : `No ${tab === 'short' ? 'short-term' : 'long-term'} ${labels.issues.toLowerCase()}`}
          description={tab === 'long' ? 'Park the bigger questions here until the right time.' : tab === 'solved' ? 'Solved items show up here.' : `Raise what is in the way. Your team ranks and solves ${labels.issues.toLowerCase()} together.`}
          action={tab !== 'solved' && canWrite ? <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} strokeWidth={2} />New {labels.issue.toLowerCase()}</Button> : undefined}
        />
      ) : (
        <ol className="flex flex-col">
          {list.map((i, idx) => (
            <li key={i.id} className="group relative border-b border-line-faint last:border-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(i.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedId(i.id) }}
                className="flex min-h-[48px] w-full cursor-default items-center gap-3 rounded-md px-2 py-1.5 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums', tab === 'solved' ? 'bg-success-soft text-success-text' : idx < 3 ? 'bg-accent-soft text-accent-text' : 'bg-canvas text-body')}>
                  {tab === 'solved' ? <CheckCircle2 size={14} strokeWidth={2} /> : idx + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className={cn('truncate text-base font-[500] text-ink', tab === 'solved' && 'text-body line-through decoration-faint')}>{i.title}</span>
                    {i.actorAgent && <Tip label="Raised by an agent"><span className="inline-flex"><AgentMark size={14} /></span></Tip>}
                  </span>
                  {sources[i.id] && <SourceChip source={sources[i.id]} className="w-fit" />}
                </div>
                <PersonChip person={personOf(i.ownerId)} />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-faint" title={`Raised ${new Date(i.createdAt).toLocaleDateString()}`}>
                  {ageLabel(tab === 'solved' && i.solvedAt ? i.solvedAt : i.createdAt, now)}
                </span>
              </div>
              {canRank && (
                <div className={cn("absolute right-14 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised p-0.5 shadow-pop", canWrite && "group-focus-within:flex group-hover:flex")}>
                  <Button size="icon" variant="ghost" className="size-6" aria-label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp size={14} strokeWidth={1.8} /></Button>
                  <Button size="icon" variant="ghost" className="size-6" aria-label="Move down" disabled={idx === list.length - 1} onClick={() => move(idx, 1)}><ArrowDown size={14} strokeWidth={1.8} /></Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <IssueSheet key={selected?.id ?? 'none'} orgSlug={orgSlug} issue={selected} people={people} teams={teams} labels={labels} source={selected ? sources[selected.id] ?? null : null} onClose={() => setSelectedId(null)} />
      <NewIssueDialog open={creating} onOpenChange={setCreating} orgSlug={orgSlug} people={people} teams={teams} defaultTeamId={teamId ?? teams[0]?.id ?? null} defaultHorizon={tab === 'long' ? 'long' : 'short'} labels={labels} />
    </div>
  )
}

function IssueSheet({ orgSlug, issue, people, teams, labels, source, onClose }: { orgSlug: string; issue: IssueItem | null; people: PersonLite[]; teams: TeamLite[]; labels: { issue: string; solve: string }; source: SourceInfo | null; onClose: () => void }) {
  const { act, pending } = useAct()
  const canWrite = useCanWrite()
  const [title, setTitle] = React.useState(issue?.title ?? '')
  const [description, setDescription] = React.useState(issue?.description ?? '')
  const [ownerId, setOwnerId] = React.useState<string | null>(issue?.ownerId ?? null)
  const dirty = issue ? title !== issue.title || description !== (issue.description ?? '') || ownerId !== issue.ownerId : false
  const open = issue?.status === 'open'
  return (
    <Sheet open={!!issue} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        {issue && (
          <fieldset disabled={!canWrite} className="contents">
            <SheetHeader>
              <SheetTitle>{labels.issue}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5">
                <Badge tone={issue.status === 'solved' ? 'success' : 'neutral'}>{issue.status === 'open' ? (issue.horizon === 'long' ? 'Long-term' : 'Short-term') : issue.status === 'solved' ? 'Solved' : 'Dropped'}</Badge>
                <SourceChip source={source} />
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-3 overflow-auto">
              <Field label="Title" htmlFor="issue-title"><Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Description" htmlFor="issue-desc"><Textarea id="issue-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the context? What would solving it look like?" /></Field>
              <Field label="Owner"><OwnerPicker single people={people} value={ownerId ? [ownerId] : []} onChange={(ids) => setOwnerId(ids[0] ?? null)} /></Field>
              {open && (
                <Field label="Move">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => act(() => moveIssueAction(orgSlug, issue.id, { horizon: issue.horizon === 'short' ? 'long' : 'short' }), { success: issue.horizon === 'short' ? 'Moved to long-term' : 'Moved to short-term', onDone: onClose })}>
                      {issue.horizon === 'short' ? 'Move to long-term' : 'Move to short-term'}
                    </Button>
                    <Select value={issue.teamId ?? undefined} onValueChange={(v) => act(() => moveIssueAction(orgSlug, issue.id, { teamId: v }), { success: 'Moved to team', onDone: onClose })}>
                      <SelectTrigger className="w-44" aria-label="Move to team"><SelectValue placeholder="Move to team" /></SelectTrigger>
                      <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </Field>
              )}
            </div>
            <SheetFooter className="flex-wrap justify-between">
              <div className="flex gap-2">
                {open ? (
                  <>
                    <Button variant="primary" loading={pending} onClick={() => act(() => issueStateAction(orgSlug, issue.id, 'solve'), { success: 'Marked solved', onDone: onClose })}><CheckCircle2 size={14} strokeWidth={1.8} />{labels.solve === 'Solve' ? 'Mark solved' : labels.solve}</Button>
                    <Button onClick={() => act(() => issueStateAction(orgSlug, issue.id, 'drop'), { success: 'Dropped', onDone: onClose })}><Trash2 size={14} strokeWidth={1.8} />Drop</Button>
                  </>
                ) : (
                  <Button onClick={() => act(() => issueStateAction(orgSlug, issue.id, 'reopen'), { success: 'Reopened', onDone: onClose })}><RotateCcw size={14} strokeWidth={1.8} />Reopen</Button>
                )}
              </div>
              <Button variant="secondary" disabled={!dirty || !title.trim()} loading={pending} onClick={() => act(() => updateIssueAction(orgSlug, { issueId: issue.id, title: title.trim(), description: description.trim() || null, ownerId }), { success: 'Saved' })}>Save changes</Button>
            </SheetFooter>
          </fieldset>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function NewIssueDialog({
  open, onOpenChange, orgSlug, people, teams, defaultTeamId, defaultHorizon = 'short', labels, source, initialTitle, initialOwnerIds,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orgSlug: string
  people: PersonLite[]
  teams: TeamLite[]
  defaultTeamId: string | null
  defaultHorizon?: 'short' | 'long'
  labels: { issue: string }
  source?: { type: string; id: string } | null
  initialTitle?: string
  initialOwnerIds?: string[]
}) {
  const { act, pending } = useAct()
  const [title, setTitle] = React.useState(initialTitle ?? '')
  const [description, setDescription] = React.useState('')
  const [owners, setOwners] = React.useState<string[]>(initialOwnerIds ?? [])
  const [team, setTeam] = React.useState<string>(defaultTeamId ?? teams[0]?.id ?? '')
  const [horizon, setHorizon] = React.useState<'short' | 'long'>(defaultHorizon)
  useOnChange(open, (o) => { if (o) { setTitle(initialTitle ?? ''); setHorizon(defaultHorizon); setTeam(defaultTeamId ?? teams[0]?.id ?? ''); setOwners(initialOwnerIds ?? []) } })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    act(() => createIssuesAction(orgSlug, { title: title.trim(), description: description.trim(), ownerIds: owners, teamId: team || null, horizon, source }), {
      success: owners.length > 1 ? `Created ${owners.length} ${labels.issue.toLowerCase()}s` : `${labels.issue} created`,
      onDone: () => { setTitle(''); setDescription(''); setOwners([]); onOpenChange(false) },
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New {labels.issue.toLowerCase()}</DialogTitle>
            <DialogDescription>Raise something that needs to be solved. Several owners create one each.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="ni-title"><Input id="ni-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is in the way?" /></Field>
          <Field label="Description" htmlFor="ni-desc"><Textarea id="ni-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owners"><OwnerPicker people={people} value={owners} onChange={setOwners} placeholder="Just me" /></Field>
            <Field label="Team">
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger>
                <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="List">
            <Segmented<'short' | 'long'> aria-label="Horizon" value={horizon} onValueChange={setHorizon} options={[{ value: 'short', label: 'Short-term' }, { value: 'long', label: 'Long-term' }]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!title.trim()}>Create {labels.issue.toLowerCase()}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
