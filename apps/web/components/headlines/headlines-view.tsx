'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Megaphone, MoreHorizontal, Plus, Send, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { Badge, type BadgeTone } from '@movara/ui/badge'
import { Field } from '@movara/ui/field'
import { Textarea } from '@movara/ui/textarea'
import { EmptyState } from '@movara/ui/empty-state'
import { AgentMark } from '@movara/ui/agent-mark'
import { Segmented } from '@movara/ui/segmented'
import { Checkbox } from '@movara/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { Tip } from '@movara/ui/tooltip'
import { cn } from '@movara/ui/cn'
import { ageLabel, OwnerPicker, PersonChip, useAct, type PersonLite, type TeamLite } from '../issues/common'
import { cascadeHeadlineAction, deleteHeadlineAction, postHeadlineAction, reviewHeadlineAction } from '@/app/(app)/[org]/headlines/actions'
import { useCanWrite } from '@/components/shell/shell-context'

type Kind = 'customer' | 'employee' | 'general'
export type HeadlineItem = { id: string; text: string; kind: Kind; ownerId: string | null; teamId: string | null; createdAt: string; reviewedAt: string | null; cascaded: boolean; cascadedFromId: string | null; actorAgent: boolean }
const KIND: Record<Kind, { label: string; tone: BadgeTone }> = { customer: { label: 'Customer', tone: 'accent' }, employee: { label: 'Employee', tone: 'warning' }, general: { label: 'General', tone: 'neutral' } }
type Tab = 'review' | 'reviewed' | 'all'

export function HeadlinesView({ orgSlug, headlines, people, teams, teamId, defaultTeamId, meId, now, labels, highlightId, openNew }: {
  highlightId?: string; openNew?: boolean; orgSlug: string; headlines: HeadlineItem[]; people: PersonLite[]; teams: TeamLite[]; teamId: string | null; defaultTeamId: string; meId: string; now: string; labels: { headline: string; headlines: string }
}) {
  const canWrite = useCanWrite()
  const router = useRouter()
  const { act } = useAct()
  const [tab, setTab] = React.useState<Tab>(() => { const h = highlightId ? headlines.find((x) => x.id === highlightId) : undefined; return h ? (h.reviewedAt ? 'reviewed' : 'review') : 'review' })
  const [posting, setPosting] = React.useState(!!openNew)
  React.useEffect(() => { if (highlightId) document.querySelector(`[data-headline-id="${highlightId}"]`)?.scrollIntoView({ block: 'center' }) }, [highlightId])
  const [cascading, setCascading] = React.useState<HeadlineItem | null>(null)
  const person = (id: string | null) => people.find((p) => p.id === id) ?? null
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null
  const toReview = headlines.filter((h) => !h.reviewedAt)
  const reviewed = headlines.filter((h) => h.reviewedAt)
  const list = tab === 'review' ? toReview : tab === 'reviewed' ? reviewed : headlines

  return (
    <div className="flex w-full flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab> aria-label="Show" value={tab} onValueChange={setTab} options={[
          { value: 'review', label: <>To review <span className="text-faint">{toReview.length}</span></> },
          { value: 'reviewed', label: <>Reviewed <span className="text-faint">{reviewed.length}</span></> },
          { value: 'all', label: 'All' },
        ]} />
        <div className="ml-auto flex items-center gap-2">
          <Select value={teamId ?? 'all'} onValueChange={(v) => router.push(v === 'all' ? '?' : `?team=${v}`)}>
            <SelectTrigger className="w-44" aria-label="Team"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All teams</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          {canWrite && <Button variant="primary" onClick={() => setPosting(true)}><Plus size={14} strokeWidth={2} />Post {labels.headline.toLowerCase()}</Button>}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Megaphone />} title={tab === 'reviewed' ? `No reviewed ${labels.headlines.toLowerCase()}` : `No ${labels.headlines.toLowerCase()} to review`} description="Share good news from customers and the team so everyone starts the week in the loop." action={canWrite ? <Button variant="primary" onClick={() => setPosting(true)}><Plus size={14} strokeWidth={2} />Post {labels.headline.toLowerCase()}</Button> : undefined} />
      ) : (
        <ul className="flex flex-col">
          {list.map((h) => (
            <li key={h.id} data-headline-id={h.id} data-highlight={h.id === highlightId || undefined} className={cn('group flex items-start gap-3 border-b border-line-faint px-2 py-2.5 last:border-0 hover:bg-canvas', h.id === highlightId && 'bg-accent-soft')}>
              <Checkbox className="mt-0.5" checked={!!h.reviewedAt} disabled={!canWrite} aria-label={h.reviewedAt ? 'Mark not reviewed' : 'Mark reviewed'} onCheckedChange={(c) => act(() => reviewHeadlineAction(orgSlug, h.id, c === true), { success: c === true ? 'Marked reviewed' : 'Marked not reviewed' })} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className={cn('text-base font-[500]', h.reviewedAt ? 'text-body' : 'text-ink')}>{h.text}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
                  <Badge tone={KIND[h.kind].tone}>{KIND[h.kind].label}</Badge>
                  {h.reviewedAt && <Badge tone="success">Reviewed</Badge>}
                  {teamName(h.teamId) && <span>{teamName(h.teamId)}</span>}
                  {h.cascaded && <span className="inline-flex items-center gap-1"><Send size={11} strokeWidth={1.8} />Cascaded</span>}
                  <span>· {ageLabel(h.createdAt, now) === 'today' ? 'today' : `${ageLabel(h.createdAt, now)} ago`}</span>
                  {h.actorAgent && <Tip label="Posted by an agent"><span className="inline-flex"><AgentMark size={14} /></span></Tip>}
                </div>
              </div>
              <PersonChip person={person(h.ownerId)} className="mt-0.5" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canWrite}><Button size="icon" variant="ghost" className="size-6 disabled:invisible" aria-label="Actions" disabled={!canWrite}><MoreHorizontal size={15} strokeWidth={1.7} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem icon={h.reviewedAt ? <Undo2 /> : <CheckCheck />} onSelect={() => act(() => reviewHeadlineAction(orgSlug, h.id, !h.reviewedAt))}>{h.reviewedAt ? 'Mark not reviewed' : 'Mark reviewed'}</DropdownMenuItem>
                  <DropdownMenuItem icon={<Send />} onSelect={() => setCascading(h)}>Cascade to teams…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive icon={<Trash2 />} onSelect={() => act(() => deleteHeadlineAction(orgSlug, h.id), { success: 'Deleted' })}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <PostDialog open={posting} onOpenChange={setPosting} orgSlug={orgSlug} people={people} teams={teams} defaultTeamId={teamId ?? defaultTeamId} meId={meId} labels={labels} />
      <CascadeDialog key={cascading?.id ?? 'none'} headline={cascading} onClose={() => setCascading(null)} orgSlug={orgSlug} teams={teams} headlines={headlines} />
    </div>
  )
}

function PostDialog({ open, onOpenChange, orgSlug, people, teams, defaultTeamId, meId, labels }: { open: boolean; onOpenChange: (o: boolean) => void; orgSlug: string; people: PersonLite[]; teams: TeamLite[]; defaultTeamId: string; meId: string; labels: { headline: string } }) {
  const { act, pending } = useAct()
  const [text, setText] = React.useState('')
  const [kind, setKind] = React.useState<Kind>('general')
  const [team, setTeam] = React.useState(defaultTeamId)
  const [owners, setOwners] = React.useState<string[]>([meId])
  React.useEffect(() => { if (open) { setText(''); setKind('general'); setTeam(defaultTeamId); setOwners([meId]) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) act(() => postHeadlineAction(orgSlug, { text: text.trim(), kind, ownerIds: owners, teamId: team }), { success: `${labels.headline} posted`, onDone: () => onOpenChange(false) }) }}>
          <DialogHeader><DialogTitle>Post {labels.headline.toLowerCase()}</DialogTitle><DialogDescription>A short update for the next meeting.</DialogDescription></DialogHeader>
          <Field label="What happened?" htmlFor="hl-text"><Textarea id="hl-text" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Northwind renewed for two years" /></Field>
          <Field label="Kind"><Segmented aria-label="Kind" value={kind} onValueChange={setKind} options={[{ value: 'general', label: 'General' }, { value: 'customer', label: 'Customer' }, { value: 'employee', label: 'Employee' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team"><Select value={team} onValueChange={setTeam}><SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger><SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Owners"><OwnerPicker people={people} value={owners} onChange={setOwners} /></Field>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" loading={pending} disabled={!text.trim() || !team}>Post</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CascadeDialog({ headline, onClose, orgSlug, teams, headlines }: { headline: HeadlineItem | null; onClose: () => void; orgSlug: string; teams: TeamLite[]; headlines: HeadlineItem[] }) {
  const { act, pending } = useAct()
  const [picked, setPicked] = React.useState<string[]>([])
  const held = new Set(headlines.filter((h) => headline && (h.id === headline.id || h.cascadedFromId === headline.id || (headline.cascadedFromId && (h.cascadedFromId === headline.cascadedFromId || h.id === headline.cascadedFromId)))).map((h) => h.teamId))
  const options = teams.filter((t) => !held.has(t.id))
  return (
    <Dialog open={!!headline} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cascade to teams</DialogTitle><DialogDescription>Copy this to other teams&apos; lists. Teams that already have it are skipped.</DialogDescription></DialogHeader>
        <p className="rounded-md bg-canvas px-3 py-2 text-base text-ink">{headline?.text}</p>
        <div className="flex flex-col gap-1">
          {options.length === 0 && <p className="text-base text-body">Every team already has this.</p>}
          {options.map((t) => (
            <label key={t.id} className="flex h-8 items-center gap-2.5 rounded-md px-2 text-base font-[500] text-ink hover:bg-canvas">
              <Checkbox checked={picked.includes(t.id)} onCheckedChange={(c) => setPicked((p) => (c === true ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
              {t.name}
            </label>
          ))}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={picked.length === 0} onClick={() => headline && act(() => cascadeHeadlineAction(orgSlug, headline.id, picked), { success: 'Cascaded', onDone: onClose })}>Cascade</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
