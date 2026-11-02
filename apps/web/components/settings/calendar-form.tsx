'use client'

import { useState } from 'react'
import { currentQuarter, quarterRange, todayIn, weekOfQuarter } from '@motion/core/calendar'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { updateCalendar } from '@/app/(app)/[org]/settings/actions'
import { TIMEZONES } from './general-form'
import { NativeSelect, Panel } from './ui'
import { useSave } from './use-save'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function CalendarForm({ slug, init, canEdit }: { slug: string; init: { fiscalYearStartMonth: number; weekStartDay: number; timezone: string }; canEdit: boolean }) {
  const [m, setM] = useState(init.fiscalYearStartMonth)
  const [w, setW] = useState(init.weekStartDay)
  const [tz, setTz] = useState(init.timezone)
  const { save, pending } = useSave()
  const cal = { fiscalYearStartMonth: m, weekStartDay: w, timezone: tz }
  let preview: { label: string; start: string; end: string; week: number } | null = null
  try {
    const today = todayIn(cal)
    const label = currentQuarter(cal)
    const r = quarterRange(label, cal)
    preview = { label, start: r.start, end: r.end, week: weekOfQuarter(today, cal).week }
  } catch {
    preview = null
  }
  const dirty = m !== init.fiscalYearStartMonth || w !== init.weekStartDay || tz !== init.timezone
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(() => updateCalendar(slug, { fiscalYearStartMonth: m, weekStartDay: w, timezone: tz }), 'Calendar saved') }}>
      <Panel className="divide-y-0">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Fiscal year starts in" htmlFor="cal-m" hint="Quarter 1 begins in this month.">
            <NativeSelect id="cal-m" value={m} onChange={(e) => setM(Number(e.target.value))} disabled={!canEdit}>
              {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Week starts on" htmlFor="cal-w">
            <NativeSelect id="cal-w" value={w} onChange={(e) => setW(Number(e.target.value))} disabled={!canEdit}>
              {DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Timezone" htmlFor="cal-tz" className="sm:col-span-2">
            <Input id="cal-tz" list="cal-tz-list" value={tz} onChange={(e) => setTz(e.target.value)} disabled={!canEdit} />
            <datalist id="cal-tz-list">{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
        </div>
      </Panel>
      {preview && (
        <div className="flex items-center gap-4 rounded-xl bg-canvas p-4" data-testid="quarter-preview">
          <div>
            <div className="text-xs font-[550] text-faint">Current quarter</div>
            <div className="text-lg font-semibold text-ink">{preview.label}</div>
          </div>
          <div className="text-base text-body">{fmt(preview.start)} to {fmt(preview.end)}</div>
          <div className="ml-auto text-base text-body">Week <b className="text-ink">{preview.week}</b> of 13</div>
        </div>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!dirty} loading={pending}>Save calendar</Button>
        </div>
      )}
    </form>
  )
}
