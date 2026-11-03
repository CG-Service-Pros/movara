/** Small date/time helpers. Always pass the org timezone so server and client render the same text. */
export function fmtDay(iso: string | Date, tz: string, withYear = false): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: tz }).format(new Date(iso))
}
export function fmtWeekday(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }).format(new Date(iso))
}
export function fmtTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso))
}
/** 'YYYY-MM-DD' -> 'Nov 10'. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
}
export function fmtClock(ms: number): string {
  const neg = ms < 0
  const s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${neg ? '-' : ''}${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

const DAYS: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

/** 'FREQ=WEEKLY;BYDAY=MO,WE' + '09:00' -> 'Weekly · Mon, Wed · 9:00 AM'. null rrule = Ad hoc. */
export function describeCadence(rrule: string | null, startTime: string | null): string {
  if (!rrule) return 'Ad hoc'
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]))
  const days = (parts.BYDAY ?? '').split(',').filter(Boolean).map((d) => DAYS[d] ?? d)
  const freq = parts.FREQ === 'WEEKLY' ? 'Weekly' : parts.FREQ === 'DAILY' ? 'Daily' : parts.FREQ === 'MONTHLY' ? 'Monthly' : (parts.FREQ ?? 'Repeats')
  let t = ''
  if (startTime) {
    const [h, m] = startTime.split(':').map(Number) as [number, number]
    t = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }
  return [freq, days.join(', '), t].filter(Boolean).join(' · ')
}

export function formatMetricValue(v: number | null, m: { unit: string; scale: number; decimals: number }): string | null {
  if (v === null || v === undefined) return null
  if (m.unit === 'boolean') return v ? 'Yes' : 'No'
  const scaled = m.scale && m.scale !== 1 ? v / m.scale : v
  const suffix = m.scale === 1000 ? 'k' : m.scale === 1_000_000 ? 'M' : ''
  const n = scaled.toLocaleString('en-US', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })
  if (m.unit === 'currency') return `$${n}${suffix}`
  if (m.unit === 'percent') return `${n}${suffix}%`
  if (m.unit === 'duration') return `${n}${suffix} h`
  return `${n}${suffix}`
}
export function goalText(m: { comparison: string; goal: number | null; goalUpper: number | null; unit: string; scale: number; decimals: number }): string {
  if (m.goal === null) return 'No goal'
  const g = formatMetricValue(m.goal, m)!
  switch (m.comparison) {
    case 'gte': return `≥ ${g}`
    case 'lte': return `≤ ${g}`
    case 'gt': return `> ${g}`
    case 'lt': return `< ${g}`
    case 'eq': return `= ${g}`
    case 'between': return `${g} – ${formatMetricValue(m.goalUpper ?? m.goal, m)}`
    default: return g
  }
}

/** Length of an agenda: "45 min", "5 h 55 min", or "2 days" for multi-day sessions. */
export function fmtLength(minutes: number, days = 1): string {
  if (days > 1) return `${days} days`
  const h = Math.floor(minutes / 60)
  return h ? `${h} h ${minutes % 60} min` : `${minutes} min`
}
