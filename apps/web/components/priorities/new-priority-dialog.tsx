'use client'

import * as React from 'react'
import { Button } from '@movara/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { Textarea } from '@movara/ui/textarea'
import { toast } from '@movara/ui/toaster'
import type { Labels, Option, PLevel } from './types'

export type NewPriorityInput = { title: string; ownerId: string | null; teamId: string | null; level: PLevel; dueDate: string | null; milestones: string[] }

const NONE = 'none'

export function NewPriorityDialog({
  open,
  onOpenChange,
  labels,
  people,
  teams,
  defaults,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  labels: Labels
  people: Option[]
  teams: Option[]
  defaults: { ownerId: string; teamId: string | null; level: PLevel; dueDate: string }
  onCreate: (input: NewPriorityInput) => Promise<string | null>
}) {
  const [title, setTitle] = React.useState('')
  const [ownerId, setOwnerId] = React.useState(defaults.ownerId)
  const [teamId, setTeamId] = React.useState<string>(defaults.teamId ?? NONE)
  const [level, setLevel] = React.useState<PLevel>(defaults.level)
  const [dueDate, setDueDate] = React.useState(defaults.dueDate)
  const [ms, setMs] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle('')
      setOwnerId(defaults.ownerId)
      setTeamId(defaults.teamId ?? NONE)
      setLevel(defaults.level)
      setDueDate(defaults.dueDate)
      setMs('')
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const p = labels.priority.singular.toLowerCase()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give it a title.')
    setBusy(true)
    setError(null)
    const err = await onCreate({
      title: title.trim(),
      ownerId: ownerId === NONE ? null : ownerId,
      teamId: teamId === NONE ? null : teamId,
      level,
      dueDate: dueDate || null,
      milestones: ms.split('\n').map((s) => s.trim()).filter(Boolean),
    }).then(() => null, (x) => String(x?.message ?? x))
    setBusy(false)
    // Server refusals (permissions, validation from core) are not about the title field: show them as a toast.
    if (err) toast.error(err)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New {p}</DialogTitle>
            <DialogDescription>What has to be true by the end of the quarter?</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="np-title" error={error}>
            <Input id="np-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. Ship the partner portal`} aria-invalid={!!error || undefined} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner" htmlFor="np-owner">
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="np-owner">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {people.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={labels.team} htmlFor="np-team">
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="np-team">
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No team</SelectItem>
                  {teams.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Level" htmlFor="np-level">
              <Select value={level} onValueChange={(v) => setLevel(v as PLevel)}>
                <SelectTrigger id="np-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="team">{labels.team}</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="np-due">
              <Input id="np-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </Field>
          </div>
          <Field label={labels.milestone.plural} htmlFor="np-ms" hint="One per line. You can add more later.">
            <Textarea id="np-ms" rows={3} value={ms} onChange={(e) => setMs(e.target.value)} placeholder={`First ${labels.milestone.singular.toLowerCase()}\nSecond ${labels.milestone.singular.toLowerCase()}`} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Create {p}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
