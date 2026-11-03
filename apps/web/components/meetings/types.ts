import type { LiveState } from '@movara/core'

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
  horizon: string
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

export type QuarterReview = {
  /** The quarter being closed ("2026-Q4"). */
  quarter: string
  priorities: { id: string; title: string; ownerId: string | null; status: string }[]
  done: number
  notDone: number
  dropped: number
  byPerson: { personId: string | null; done: number; total: number; pct: number }[]
  scorecard: {
    /** Share of recorded metric-weeks that were on track, 0-100 (null when nothing was recorded). */
    onTrackPct: number | null
    recorded: number
    metrics: { id: string; title: string; ownerId: string | null; recorded: number; onTrack: number; first: string | null; last: string | null; trend: 'up' | 'down' | 'flat' | null }[]
  } | null
}
export type VisionReview = {
  hasPublished: boolean
  hasDraft: boolean
  sections: { key: string; label: string; items: { id: string; label: string | null; text: string }[] }[]
}
export type PriorityPlan = {
  /** The quarter being planned. */
  quarter: string
  items: { id: string; title: string; ownerId: string | null; level: string; status: string }[]
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
  /** Loaded only while the matching section is current. */
  quarterReview?: QuarterReview | null
  visionReview?: VisionReview | null
  priorityPlan?: PriorityPlan | null
}

export type ActionResult = { ok: true; bundle: Bundle } | { ok: false; error: string }
