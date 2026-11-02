import type { LiveState } from '@motion/core'

/** Plain-JSON data the live meeting UI renders (served by the page and the state route). */
export type Person = { id: string; name: string }
export type Provenance = { type: 'person' | 'agent'; name: string } | null
export type SourceRef = { type: string; id: string } | null

export type BIssue = {
  id: string
  title: string
  description: string | null
  ownerId: string | null
  rank: number
  status: string
  source: SourceRef
  sourceLabel: string | null
  createdBy: Provenance
}
export type BTodo = {
  id: string
  title: string
  ownerId: string | null
  dueDate: string | null
  status: 'open' | 'pending' | 'done'
  source: SourceRef
  createdBy: Provenance
}
export type BHeadline = { id: string; text: string; kind: string; ownerId: string | null; reviewed: boolean; createdBy: Provenance }
export type BMetric = {
  id: string
  title: string
  ownerIds: string[]
  valueLabel: string | null
  goalLabel: string
  previousLabel: string | null
  status: 'on' | 'off' | 'missing'
}
export type BPriority = {
  id: string
  title: string
  ownerId: string | null
  status: string
  dueDate: string | null
  milestonesDone: number
  milestonesTotal: number
}

export type Bundle = {
  live: LiveState
  /** The acting person. */
  me: Person | null
  people: Person[]
  teamName: string
  timezone: string
  /** Today as YYYY-MM-DD in the org timezone. */
  today: string
  scribe: { id: string; name: string; online: boolean } | null
  otherTeams: { id: string; name: string }[]
  /** Term labels: `labels[key]` = { s: singular, p: plural, t: short }. */
  labels: Record<string, { s: string; p: string; t: string }>
  statusLabels: Record<string, string>
  scorecard: { period: string; metrics: BMetric[]; onTrack: number; offTrack: number; missing: number } | null
  priorities: BPriority[]
  headlines: BHeadline[]
  todos: BTodo[]
  issues: BIssue[]
}

export type ActionResult = { ok: true; bundle: Bundle } | { ok: false; error: string }
