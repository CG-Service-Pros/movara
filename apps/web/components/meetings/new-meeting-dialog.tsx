'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@movara/ui/dialog'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { Segmented } from '@movara/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movara/ui/select'
import { toast } from '@movara/ui/toaster'
import { createSeries } from '@/app/(app)/[org]/meetings/actions'
import { WEEKDAYS, fmtLength } from './format'

type AgendaRow = { term: string; minutes: number; day?: 1 | 2 }

export type DialogData = {
  slug: string
  defaultTeamId: string
  teams: { id: string; name: string; memberIds: string[] }[]
  people: { id: string; name: string }[]
  templates: { key: string; name: string; agenda: AgendaRow[] }[]
  /** Labels for day 1 and day 2 of multi-day templates. */
  dayLabels: [string, string]
  agents: { id: string; name: string }[]
  /** Terms usable as agenda sections: value is the term key. */
  sectionTerms: { key: string; label: string }[]
  labels: { meeting: string; newMeeting: string }
  today: string
}

const DAY_LABEL: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }

export function NewMeetingDialog({ data, defaultOpen = false }: { data: DialogData; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = data.templates[0]
  const [teamId, setTeamId] = useState(data.defaultTeamId)
  const [templateKey, setTemplateKey] = useState(first?.key ?? 'weekly')
  const [agenda, setAgenda] = useState<AgendaRow[]>(first?.agenda ?? [])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'weekly' | 'adhoc'>('weekly')
  const [days, setDays] = useState<string[]>(['MO'])
  const [time, setTime] = useState('09:00')
  const [date, setDate] = useState(data.today)
  const team = data.teams.find((t) => t.id === teamId)
  const [attendees, setAttendees] = useState<string[]>(team?.memberIds ?? [])
  const [scribe, setScribe] = useState('none')
  const minutesOf = (rows: AgendaRow[]) => rows.reduce((n, a) => n + (Number.isFinite(a.minutes) ? a.minutes : 0), 0)
  const daysOf = (rows: AgendaRow[]) => Math.max(1, ...rows.map((a) => a.day ?? 1))
  const total = useMemo(() => minutesOf(agenda), [agenda])
  const dayCount = daysOf(agenda)
  const label = (k: string) => data.sectionTerms.find((t) => t.key === k)?.label ?? k

  const pickTemplate = (key: string) => {
    setTemplateKey(key)
    const t = data.templates.find((x) => x.key === key)
    if (t) setAgenda(t.agenda.map((a) => ({ ...a })))
    // Planning sessions and alignment check-ins are one-offs by default; only the weekly meeting repeats weekly.
    setKind(key === 'weekly' || key === 'l10' ? 'weekly' : 'adhoc')
  }
  const pickTeam = (id: string) => {
    setTeamId(id)
    setAttendees(data.teams.find((t) => t.id === id)?.memberIds ?? [])
  }
  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the meeting a name')
    if (agenda.length === 0) return setError('Add at least one section')
    setBusy(true)
    const r = await createSeries(data.slug, {
      name: name.trim(),
      teamId,
      templateKey,
      agenda: agenda.map((a) => ({ term: a.term, minutes: Math.max(1, Math.round(a.minutes) || 1), ...(a.day ? { day: a.day } : {}) })),
      schedule: kind === 'weekly' ? { kind, days, time } : { kind, date, time },
      attendeeIds: attendees,
      scribeAgentId: scribe === 'none' ? null : scribe,
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    toast.success('Meeting created')
    setOpen(false)
    setName('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus size={14} /> {data.labels.newMeeting}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{data.labels.newMeeting}</DialogTitle>
          <DialogDescription>A meeting for a team: pick a template, then repeat it weekly or run it once.</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-auto px-1 pb-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="nm-name" className="col-span-2">
              <Input id="nm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Delivery weekly" autoFocus />
            </Field>
            <Field label="Team" htmlFor="nm-team">
              <Select value={teamId} onValueChange={pickTeam}>
                <SelectTrigger id="nm-team"><SelectValue /></SelectTrigger>
                <SelectContent>{data.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Template" htmlFor="nm-template">
              <Select value={templateKey} onValueChange={pickTemplate}>
                <SelectTrigger id="nm-template"><SelectValue>{data.templates.find((t) => t.key === templateKey)?.name}</SelectValue></SelectTrigger>
                <SelectContent>{data.templates.map((t) => <SelectItem key={t.key} value={t.key}>{t.agenda.length ? `${t.name} · ${fmtLength(minutesOf(t.agenda), daysOf(t.agenda))}` : t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-[550] text-ink">Agenda</span>
              <span className="text-xs tabular-nums text-faint" data-testid="agenda-total">{fmtLength(total, dayCount)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {agenda.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-body">No sections yet. Add the sections this meeting needs.</p>}
              {agenda.map((a, i) => (
                <Fragment key={i}>
                {dayCount > 1 && (i === 0 || (agenda[i - 1]!.day ?? 1) !== (a.day ?? 1)) && (
                  <div className={cn('flex items-center justify-between text-xs font-[600] text-body', i > 0 && 'mt-2')}>
                    <span>{data.dayLabels[(a.day ?? 1) - 1]}</span>
                    <span className="font-[500] tabular-nums text-faint">{fmtLength(minutesOf(agenda.filter((x) => (x.day ?? 1) === (a.day ?? 1))))}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-4 text-xs tabular-nums text-faint">{i + 1}</span>
                  <Select value={a.term} onValueChange={(v) => setAgenda((s) => s.map((x, j) => (j === i ? { ...x, term: v } : x)))}>
                    <SelectTrigger className="flex-1" aria-label={`Section ${i + 1}`}><SelectValue>{label(a.term)}</SelectValue></SelectTrigger>
                    <SelectContent>{data.sectionTerms.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={480}
                    className="w-20 text-right tabular-nums"
                    aria-label={`Minutes for section ${i + 1}`}
                    value={a.minutes}
                    onChange={(e) => setAgenda((s) => s.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))}
                  />
                  <span className="text-xs text-faint">min</span>
                  <Button size="icon" variant="ghost" aria-label="Remove section" onClick={() => setAgenda((s) => s.filter((_, j) => j !== i))}><X size={14} /></Button>
                </div>
                </Fragment>
              ))}
            </div>
            <Button className="mt-2" size="sm" variant="ghost" onClick={() => setAgenda((s) => [...s, { term: data.sectionTerms[0]?.key ?? 'check_in', minutes: 5, ...(s.length && s[s.length - 1]!.day ? { day: s[s.length - 1]!.day } : {}) }])}><Plus size={13} /> Add section</Button>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-[550] text-ink">Schedule</span>
            <Segmented
              aria-label="Schedule"
              value={kind}
              onValueChange={setKind}
              options={[{ value: 'weekly', label: 'Weekly' }, { value: 'adhoc', label: 'Ad hoc' }]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {kind === 'weekly' ? (
                <div className="flex gap-1" role="group" aria-label="Days">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={days.includes(d)}
                      onClick={() => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}
                      className={cn('h-7 w-10 rounded-md text-xs font-[550] outline-none focus-visible:ring-2 focus-visible:ring-accent/50', days.includes(d) ? 'bg-accent text-white' : 'bg-canvas text-body hover:text-ink')}
                    >
                      {DAY_LABEL[d]}
                    </button>
                  ))}
                </div>
              ) : (
                <Input type="date" className="w-40" value={date} min={data.today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
              )}
              <Input type="time" className="w-32" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-[550] text-ink">Attendees</span>
            <div className="flex flex-wrap gap-1.5">
              {data.people.map((p) => {
                const on = attendees.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAttendees((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                    className={cn('h-7 rounded-full px-3 text-sm font-[500] outline-none focus-visible:ring-2 focus-visible:ring-accent/50', on ? 'bg-accent-soft text-accent-text' : 'bg-canvas text-body hover:text-ink')}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
            {data.agents.length > 0 && (
              <Field className="mt-3" label="Note-taking agent" htmlFor="nm-scribe">
                <Select value={scribe} onValueChange={setScribe}>
                  <SelectTrigger id="nm-scribe"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {data.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
