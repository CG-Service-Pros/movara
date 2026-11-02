import { MotionError } from '../errors'

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export const RRULE_RE = /^FREQ=WEEKLY(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?$/

/** Only weekly rules are supported (null/empty = ad-hoc). */
export function validateRrule(rrule: string | null | undefined): string | null {
  if (!rrule) return null
  const r = rrule.trim().toUpperCase().replace(/^RRULE:/, '')
  if (!RRULE_RE.test(r)) throw new MotionError('validation', 'rrule must be weekly, e.g. FREQ=WEEKLY;BYDAY=MO,WE (or empty for ad-hoc)')
  return r
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs))
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000
}

/** The UTC instant for a wall-clock date ('YYYY-MM-DD') and time ('HH:MM') in an IANA timezone. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - tzOffsetMs(guess, tz)
  const off2 = tzOffsetMs(t, tz)
  t = guess - off2
  return new Date(t)
}

const localDate = (at: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
const addDay = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

/** First occurrence strictly after `after`, or null for ad-hoc series. */
export function nextOccurrence(rrule: string | null, startTime: string | null, tz: string, after: Date): Date | null {
  const r = validateRrule(rrule)
  if (!r) return null
  const byday = /BYDAY=([A-Z,]+)/.exec(r)?.[1]?.split(',')
  const time = startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : '09:00'
  const start = localDate(after, tz)
  const wanted = new Set(byday ? byday.map((d) => DAYS.indexOf(d as (typeof DAYS)[number])) : [weekdayOf(start)])
  for (let i = 0; i <= 14; i++) {
    const day = addDay(start, i)
    if (!wanted.has(weekdayOf(day))) continue
    const at = zonedToUtc(day, time, tz)
    if (at.getTime() > after.getTime()) return at
  }
  return null
}
