import { describe, expect, it } from 'vitest'
import { currentQuarter, periodStart, quarterOf, quarterRange, recentPeriods, shiftPeriod, shiftQuarter, todayIn, weekOfQuarter, type CalendarSettings } from '../src'

const std: CalendarSettings = { fiscalYearStartMonth: 1, weekStartDay: 1, timezone: 'UTC' }

describe('quarterOf', () => {
  it('uses calendar quarters for a January fiscal start', () => {
    expect(quarterOf('2026-11-02', std)).toMatchObject({ label: '2026-Q4', start: '2026-10-01', end: '2026-12-31' })
    expect(quarterOf('2026-01-01', std).label).toBe('2026-Q1')
    expect(quarterOf('2026-03-31', std)).toMatchObject({ label: '2026-Q1', end: '2026-03-31' })
    expect(quarterOf(new Date('2026-07-01T00:00:00Z'), std).label).toBe('2026-Q3')
  })
  it('honors a fiscal year starting in April', () => {
    const c = { ...std, fiscalYearStartMonth: 4 }
    expect(quarterOf('2026-04-01', c)).toMatchObject({ label: '2026-Q1', start: '2026-04-01', end: '2026-06-30' })
    expect(quarterOf('2027-02-15', c)).toMatchObject({ label: '2026-Q4', start: '2027-01-01', end: '2027-03-31' })
  })
  it('honors a November fiscal start across the year boundary', () => {
    const c = { ...std, fiscalYearStartMonth: 11 }
    expect(quarterOf('2026-12-15', c)).toMatchObject({ label: '2026-Q1', start: '2026-11-01', end: '2027-01-31' })
    expect(quarterOf('2027-01-15', c).label).toBe('2026-Q1')
    expect(quarterOf('2027-02-01', c)).toMatchObject({ label: '2026-Q2', start: '2027-02-01' })
    expect(quarterOf('2027-10-31', c).label).toBe('2026-Q4')
  })
  it('supports custom quarter start months', () => {
    const c: CalendarSettings = { ...std, fiscalYearStartMonth: 2, quarterCalendar: { mode: 'custom', quarterStartMonths: [2, 5, 9, 11] } }
    expect(quarterOf('2026-06-10', c)).toMatchObject({ label: '2026-Q2', start: '2026-05-01', end: '2026-08-31' })
    expect(quarterOf('2027-01-10', c)).toMatchObject({ label: '2026-Q4', start: '2026-11-01', end: '2027-01-31' })
  })
})

describe('quarterRange / shiftQuarter / currentQuarter', () => {
  it('round-trips labels', () => {
    for (const fy of [1, 4, 11]) {
      const c = { ...std, fiscalYearStartMonth: fy }
      for (const label of ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']) {
        expect(quarterOf(quarterRange(label, c).start, c).label).toBe(label)
      }
    }
  })
  it('shifts quarters', () => {
    expect(shiftQuarter('2026-Q4', 1, std)).toBe('2027-Q1')
    expect(shiftQuarter('2026-Q1', -1, std)).toBe('2025-Q4')
  })
  it('computes the current quarter in the org timezone', () => {
    const now = new Date('2026-12-31T23:30:00Z')
    expect(currentQuarter({ ...std, timezone: 'UTC' }, now)).toBe('2026-Q4')
    expect(currentQuarter({ ...std, timezone: 'Pacific/Auckland' }, now)).toBe('2027-Q1')
    expect(todayIn({ timezone: 'America/New_York' }, now)).toBe('2026-12-31')
  })
})

describe('weekOfQuarter', () => {
  it('counts weeks starting with the week containing the quarter start', () => {
    // Q4 2026 starts Thu Oct 1; its first Monday-week starts Sep 28.
    expect(weekOfQuarter('2026-10-01', std)).toMatchObject({ week: 1, of: 13, quarter: '2026-Q4' })
    expect(weekOfQuarter('2026-10-04', std).week).toBe(1)
    expect(weekOfQuarter('2026-10-05', std).week).toBe(2)
    expect(weekOfQuarter('2026-11-02', std).week).toBe(6)
    expect(weekOfQuarter('2026-12-31', std).week).toBe(13)
  })
  it('respects the week start day', () => {
    expect(weekOfQuarter('2026-10-04', { ...std, weekStartDay: 0 }).week).toBe(2)
  })
})

describe('periodStart', () => {
  it('computes day/week/month/quarter starts', () => {
    expect(periodStart('2026-11-05', 'day', std)).toBe('2026-11-05')
    expect(periodStart('2026-11-05', 'week', std)).toBe('2026-11-02')
    expect(periodStart('2026-11-08', 'week', std)).toBe('2026-11-02')
    expect(periodStart('2026-11-01', 'week', std)).toBe('2026-10-26')
    expect(periodStart('2026-11-01', 'week', { ...std, weekStartDay: 0 })).toBe('2026-11-01')
    expect(periodStart('2026-11-19', 'month', std)).toBe('2026-11-01')
    expect(periodStart('2026-11-19', 'quarter', std)).toBe('2026-10-01')
  })
  it('shifts and lists periods', () => {
    expect(shiftPeriod('2026-11-02', 'week', -1)).toBe('2026-10-26')
    expect(shiftPeriod('2026-11-01', 'month', 2)).toBe('2027-01-01')
    expect(shiftPeriod('2026-10-01', 'quarter', 1)).toBe('2027-01-01')
    const ps = recentPeriods('2026-11-04', 'week', 13, std)
    expect(ps).toHaveLength(13)
    expect(ps[12]).toBe('2026-11-02')
    expect(ps[0]).toBe('2026-08-10')
  })
})
