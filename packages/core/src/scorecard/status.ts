export type MetricComparison = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'between'
export type MetricStatus = 'on' | 'off' | 'missing'

/**
 * Pure status math. `missing` when there is no value; a metric without a goal is `on`
 * (nothing to miss). `between` is inclusive on both ends (goal <= v <= goalUpper).
 */
export function metricStatus(
  m: { comparison: MetricComparison; goal: number | null; goalUpper: number | null },
  value: number | null | undefined,
): MetricStatus {
  if (value === null || value === undefined) return 'missing'
  if (m.goal === null) return 'on'
  switch (m.comparison) {
    case 'gte': return value >= m.goal ? 'on' : 'off'
    case 'gt': return value > m.goal ? 'on' : 'off'
    case 'lte': return value <= m.goal ? 'on' : 'off'
    case 'lt': return value < m.goal ? 'on' : 'off'
    case 'eq': return value === m.goal ? 'on' : 'off'
    case 'between': {
      const hi = m.goalUpper ?? m.goal
      return value >= Math.min(m.goal, hi) && value <= Math.max(m.goal, hi) ? 'on' : 'off'
    }
  }
}
