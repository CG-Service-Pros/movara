import type { VisionSections } from '@motion/core'

/** Plain data the vision components share (serializable across the server/client boundary). */
export type VisionLabels = {
  vision: string
  coreValues: string
  coreFocus: string
  longRangeTarget: string
  marketing: string
  threeYear: string
  oneYear: string
  quarterly: string
  longTermIssues: string
  priority: string
}
export type PriorityLite = { id: string; title: string; status: string }
export type IssueLite = { id: string; title: string }
export type RevisionLite = { id: string; number: number; status: 'draft' | 'published' | 'archived'; date: string | null; by: string | null }

export type FullSections = Required<VisionSections>

const picture = () => ({ date: null as string | null, revenue: '', profit: '', measurables: [] as { name: string; value: string }[], goals: [] as { text: string; provenance?: NonNullable<VisionSections['oneYear']>['goals'][number]['provenance'] }[] })

/** Fill every section with its empty value so the viewer and editor never branch on undefined. */
export function normalizeSections(s: VisionSections, quarter: string): FullSections {
  return {
    coreValues: s.coreValues ?? [],
    coreFocus: { purpose: s.coreFocus?.purpose ?? '', niche: s.coreFocus?.niche ?? '' },
    longRangeTarget: { text: s.longRangeTarget?.text ?? '', date: s.longRangeTarget?.date ?? null },
    marketing: {
      targetMarket: s.marketing?.targetMarket ?? '',
      uniques: s.marketing?.uniques ?? [],
      provenProcess: s.marketing?.provenProcess ?? '',
      guarantee: s.marketing?.guarantee ?? '',
    },
    threeYear: { ...picture(), ...(s.threeYear ?? {}) },
    oneYear: { ...picture(), ...(s.oneYear ?? {}) },
    quarterly: { quarter: s.quarterly?.quarter ?? quarter, revenue: s.quarterly?.revenue ?? '', profit: s.quarterly?.profit ?? '', priorityIds: s.quarterly?.priorityIds ?? [] },
    longTermIssueIds: s.longTermIssueIds ?? [],
  }
}

export function fmtMonthYear(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
export function fmtYear(d: string | null | undefined): string {
  return d ? d.slice(0, 4) : ''
}
export function fmtShortDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
