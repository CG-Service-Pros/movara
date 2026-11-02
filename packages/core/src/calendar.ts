/**
 * Calendar math: quarters (honoring the org's fiscal start), week N of 13, period starts.
 * All dates are 'YYYY-MM-DD' strings in the org's local calendar (use `todayIn` to get "today").
 * Fiscal year naming: the year in which the fiscal year STARTS ("2026-Q4" with a Feb fiscal start
 * runs Nov 2026 to Jan 2027).
 */
export type CalendarSettings = {
  /** 1-12. */
  fiscalYearStartMonth: number
  /** 0 = Sunday ... 6 = Saturday. */
  weekStartDay: number
  quarterCalendar?: { mode: 'standard' | 'custom'; quarterStartMonths?: [number, number, number, number] } | null
  timezone?: string
}

export type Interval = 'day' | 'week' | 'month' | 'quarter'

export type QuarterInfo = {
  /** "YYYY-Qn" */
  label: string
  year: number
  quarter: 1 | 2 | 3 | 4
  /** First day, inclusive. */
  start: string
  /** Last day, inclusive. */
  end: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) throw new Error(`Invalid date: ${s}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}
const toDateStr = (d: Date | string): string => (typeof d === 'string' ? fmt(parse(d)) : fmt(d))

/** Add days to a 'YYYY-MM-DD' string. */
export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

/** Add whole months (clamped to day 1 of the target month: callers pass month starts). */
function addMonthsToStart(date: string, months: number): string {
  const d = parse(date)
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)))
}

/** The org-local calendar date for an instant. */
export function todayIn(cal: Pick<CalendarSettings, 'timezone'>, now: Date = new Date()): string {
  const tz = cal.timezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return parts // en-CA yields YYYY-MM-DD
}

function quarterStarts(cal: CalendarSettings): [number, number, number, number] {
  if (cal.quarterCalendar?.mode === 'custom' && cal.quarterCalendar.quarterStartMonths) return cal.quarterCalendar.quarterStartMonths
  const f = cal.fiscalYearStartMonth
  return [f, ((f + 2) % 12) + 1, ((f + 5) % 12) + 1, ((f + 8) % 12) + 1]
}

/** Quarter containing a date. */
export function quarterOf(date: Date | string, cal: CalendarSettings): QuarterInfo {
  const d = toDateStr(date)
  const dt = parse(d)
  const month = dt.getUTCMonth() + 1
  const year = dt.getUTCFullYear()
  const starts = quarterStarts(cal)
  const first = starts[0]
  const offset = (m: number) => (m - first + 12) % 12
  let q = 0
  starts.forEach((s, i) => {
    if (offset(s) <= offset(month)) q = i
  })
  const fiscalYear = month >= first ? year : year - 1
  const startMonth = starts[q]!
  const startYear = startMonth <= month ? year : year - 1
  const start = `${startYear}-${pad(startMonth)}-01`
  const nextStartMonth = starts[(q + 1) % 4]!
  const lenMonths = ((nextStartMonth - startMonth + 12) % 12) || 12
  const end = addDays(addMonthsToStart(start, lenMonths), -1)
  return { label: `${fiscalYear}-Q${q + 1}`, year: fiscalYear, quarter: (q + 1) as 1 | 2 | 3 | 4, start, end }
}

/** Parse "YYYY-Qn". */
export function parseQuarter(label: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const m = /^(\d{4})-Q([1-4])$/.exec(label)
  if (!m) throw new Error(`Invalid quarter: ${label}`)
  return { year: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 }
}

export const isQuarterLabel = (s: string): boolean => /^\d{4}-Q[1-4]$/.test(s)

/** Date range of a quarter label. */
export function quarterRange(label: string, cal: CalendarSettings): QuarterInfo {
  const { year, quarter } = parseQuarter(label)
  const starts = quarterStarts(cal)
  const first = starts[0]
  const startMonth = starts[quarter - 1]!
  // Fiscal year `year` begins in month `first` of calendar year `year`.
  const startYear = startMonth >= first ? year : year + 1
  return quarterOf(`${startYear}-${pad(startMonth)}-01`, cal)
}

/** "YYYY-Qn" for the current (org-local) date. */
export function currentQuarter(cal: CalendarSettings, now: Date = new Date()): string {
  return quarterOf(todayIn(cal, now), cal).label
}

/** The quarter before/after a label. */
export function shiftQuarter(label: string, delta: number, cal: CalendarSettings): string {
  const r = quarterRange(label, cal)
  return quarterOf(addMonthsToStart(r.start, 3 * delta), cal).label
}

/** First day of the week containing `date`. */
export function weekStart(date: Date | string, weekStartDay: number): string {
  const d = parse(toDateStr(date))
  const diff = (d.getUTCDay() - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return fmt(d)
}

/**
 * Start date of the period containing `date` for an interval:
 * day -> the date, week -> week start, month -> 1st, quarter -> quarter start.
 */
export function periodStart(date: Date | string, interval: Interval, cal: CalendarSettings): string {
  const d = toDateStr(date)
  switch (interval) {
    case 'day':
      return d
    case 'week':
      return weekStart(d, cal.weekStartDay)
    case 'month':
      return `${d.slice(0, 7)}-01`
    case 'quarter':
      return quarterOf(d, cal).start
  }
}

/** Move a period start forward/back by n periods. */
export function shiftPeriod(start: string, interval: Interval, n: number): string {
  switch (interval) {
    case 'day':
      return addDays(start, n)
    case 'week':
      return addDays(start, 7 * n)
    case 'month':
      return addMonthsToStart(start, n)
    case 'quarter':
      return addMonthsToStart(start, 3 * n)
  }
}

/** The last `count` period starts ending at the period containing `date`, oldest first. */
export function recentPeriods(date: Date | string, interval: Interval, count: number, cal: CalendarSettings): string[] {
  const current = periodStart(date, interval, cal)
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, interval, -(count - 1 - i)))
}

/**
 * Week N of 13 within the quarter containing `date`. Week 1 is the week that contains the
 * quarter's first day. Returns n clamped to 1..13.
 */
export function weekOfQuarter(date: Date | string, cal: CalendarSettings): { week: number; of: 13; quarter: string } {
  const d = toDateStr(date)
  const q = quarterOf(d, cal)
  const w1 = weekStart(q.start, cal.weekStartDay)
  const diffDays = Math.round((parse(weekStart(d, cal.weekStartDay)).getTime() - parse(w1).getTime()) / 86_400_000)
  const week = Math.min(13, Math.max(1, Math.floor(diffDays / 7) + 1))
  return { week, of: 13, quarter: q.label }
}
