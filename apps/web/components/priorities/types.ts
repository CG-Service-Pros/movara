import type { ActivityItem } from '@/components/shell/activity-feed'

export type PStatus = 'on_track' | 'off_track' | 'done' | 'not_done' | 'dropped'
export type PLevel = 'company' | 'team' | 'individual'
export type Tab = 'company' | 'team' | 'mine'

export const STATUS_ORDER: PStatus[] = ['on_track', 'off_track', 'done', 'not_done', 'dropped']
/** `s` cycles through these (dropped is menu-only). */
export const STATUS_CYCLE: PStatus[] = ['on_track', 'off_track', 'done', 'not_done']

export type PriorityItem = {
  id: string
  title: string
  status: PStatus
  level: PLevel
  ownerId: string | null
  teamId: string | null
  dueDate: string | null
  milestonesTotal: number
  milestonesDone: number
}

export type MilestoneItem = { id: string; title: string; done: boolean; dueDate: string | null }

export type PriorityDetailData = {
  id: string
  title: string
  description: string | null
  status: PStatus
  level: PLevel
  ownerId: string | null
  teamId: string | null
  dueDate: string | null
  quarter: string
  version: number
  milestones: MilestoneItem[]
  parent: { id: string; title: string } | null
  children: { id: string; title: string; teamId: string | null }[]
  activity: ActivityItem[]
}

export type Option = { id: string; name: string }

/** Terminology-resolved labels, computed on the server. */
export type Labels = {
  priority: { singular: string; plural: string }
  milestone: { singular: string; plural: string }
  team: string
  status: Record<PStatus, string>
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string }
