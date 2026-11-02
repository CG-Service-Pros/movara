import type { TerminologyPack, TermOverrides } from '@motion/terminology'

/** Who performed a write. Stored on every row and on audit events. */
export type ActorJson = { type: 'person' | 'agent'; id: string; onBehalfOf?: string }

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export type Branding = {
  wordmark?: string
  logoLight?: string
  logoDark?: string
  favicon?: string
  accent?: string
  loginBackground?: string
  emailSenderName?: string
}

export type QuarterCalendar = {
  /** 'standard' = quarters start at the fiscal year start month, 3 months each. */
  mode: 'standard' | 'custom'
  /** Only for mode 'custom': start month (1-12) of each of the four quarters. */
  quarterStartMonths?: [number, number, number, number]
}

/** Module keys that can be switched off per org. Missing key = enabled. */
export const MODULE_KEYS = ['priorities', 'scorecard', 'issues', 'todos', 'headlines', 'meetings', 'vision', 'chart', 'agents'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]
export type Modules = Partial<Record<ModuleKey, boolean>>

export type OrgSettings = Record<string, unknown>

export type ReminderSchedule = { enabled?: boolean; day?: number; time?: string }

export type Source = { type: string; id: string } | null

export type AgendaItemJson = { term: string; minutes: number }

export type MeetingState = {
  sectionIndex?: number
  timers?: Record<string, unknown>
  idsState?: Record<string, unknown>
  focusIssueIds?: string[]
  [k: string]: unknown
}

export type VisionContent = { sections: Record<string, unknown> }

export type StoredPack = TerminologyPack
export type StoredOverrides = TermOverrides
