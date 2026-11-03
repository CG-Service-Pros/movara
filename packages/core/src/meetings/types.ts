import type { AgendaItemJson } from '@movara/db'

export type SectionTimer = { elapsedMs: number; runningSince: string | null }
export type IdsStatus = 'idle' | 'prioritizing' | 'discussing' | 'complete'
/** The IDS step shown for the current issue: Identify, Discuss, Solve. */
export type IdsStep = 'identify' | 'discuss' | 'solve'
export const IDS_STEPS: IdsStep[] = ['identify', 'discuss', 'solve']

export type PresenceEntry = {
  kind: 'person' | 'agent'
  /** personId or agentId. */
  id: string
  name: string
  onBehalfOf?: string
  joinedAt: string
  lastSeen: string
}

export type MeetingSettings = { sendRecap: boolean; clearItems: boolean; focusIssueCount: number }

export type MeetingStats = {
  durationMinutes: number
  ratingAvg: number | null
  ratingCount: number
  issuesSolved: number
  issuesTotal: number
  todosDone: number
  todosTotal: number
  attendeeCount: number
  invitedCount: number
  newTodoCount: number
}

/** What is stored in `meetings.state` (server-authoritative). */
export type StoredMeetingState = {
  /** Monotonic counter bumped on every state change (also by list changes of the team while live). */
  rev: number
  sectionIndex: number
  /** Agenda snapshot taken at start (so later series edits do not move a running meeting). */
  agenda: AgendaItemJson[]
  /** Per section index: accumulated elapsed ms + the instant the timer is currently running since. */
  timers: Record<string, SectionTimer>
  paused: boolean
  presence: Record<string, PresenceEntry>
  settings: MeetingSettings
  /** Issues picked for IDS in this meeting (discussed ones stay in the list). */
  focusIssueIds: string[]
  idsState: {
    status: IdsStatus
    /** Explicit step; reset to 'discuss' when an issue starts and to 'identify' when none is current. */
    step: IdsStep
    currentIssueId: string | null
    discussedIssueIds: string[]
    solvedIssueIds: string[]
    /** Issues added to the list during the meeting (drop-to-issue, capture). */
    addedIssueIds: string[]
    resolutions: Record<string, { solved: boolean; todoIds: string[] }>
  }
  newTodoIds: string[]
  newHeadlineIds: string[]
  reviewedHeadlineIds: string[]
  /** Check-in: ids of people who have shared. */
  sharedIds: string[]
  /** Quarter review: each attendee's 1-10 grade of the quarter, by person id. */
  quarterGrades: Record<string, number>
  /** Team health: each attendee's 1-10 rating and note, by person id. */
  teamHealth: Record<string, { rating: number; note: string }>
  /** Multi-day sessions: true between "End day N" and "Start day N+1" (the meeting is paused). */
  dayBreak: boolean
  /** Days that were ended with "End day N". */
  endedDays: number[]
  /** Set by meeting end. */
  stats?: MeetingStats
}

export const DEFAULT_FOCUS_ISSUE_COUNT = 3
