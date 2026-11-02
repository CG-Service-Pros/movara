export type Comparison = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'between'
export type Unit = 'number' | 'percent' | 'currency' | 'duration' | 'boolean'
export type CellStatus = 'on' | 'off' | 'missing'

export type MetricFmt = { unit: Unit; scale: number; decimals: number }
export type MetricGoal = { comparison: Comparison; goal: number | null; goalUpper: number | null }

const SUFFIX: Record<number, string> = { 1000: 'k', 1_000_000: 'M', 1_000_000_000: 'B' }

/** "$46k", "92%", "9", "Yes". `value` is the stored (raw) value. */
export function formatValue(value: number, m: MetricFmt): string {
  if (m.unit === 'boolean') return value ? 'Yes' : 'No'
  const scaled = value / (m.scale || 1)
  const n = scaled.toLocaleString('en-US', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })
  const suffix = m.scale !== 1 ? (SUFFIX[m.scale] ?? '') : ''
  if (m.unit === 'currency') return `$${n}${suffix}`
  if (m.unit === 'percent') return `${n}${suffix}%`
  if (m.unit === 'duration') return `${n}${suffix} min`
  return `${n}${suffix}`
}

const SYMBOL: Record<Exclude<Comparison, 'between'>, string> = { gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=' }

export function formatGoal(m: MetricFmt & MetricGoal): string {
  if (m.goal === null) return '—'
  if (m.comparison === 'between') return `${formatValue(m.goal, m)}–${formatValue(m.goalUpper ?? m.goal, m)}`
  return `${SYMBOL[m.comparison]} ${formatValue(m.goal, m)}`
}

/** Mirror of core's pure metricStatus (client-side optimistic status). */
export function statusOf(m: MetricGoal, value: number | null): CellStatus {
  if (value === null) return 'missing'
  if (m.goal === null) return 'on'
  switch (m.comparison) {
    case 'gte': return value >= m.goal ? 'on' : 'off'
    case 'lte': return value <= m.goal ? 'on' : 'off'
    case 'gt': return value > m.goal ? 'on' : 'off'
    case 'lt': return value < m.goal ? 'on' : 'off'
    case 'eq': return value === m.goal ? 'on' : 'off'
    case 'between': return value >= m.goal && value <= (m.goalUpper ?? m.goal) ? 'on' : 'off'
  }
}

export function periodLabel(start: string, interval: 'day' | 'week' | 'month' | 'quarter'): string {
  const d = new Date(start + 'T00:00:00Z')
  if (interval === 'month') return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (interval === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
