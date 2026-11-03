'use server'

import { revalidatePath } from 'next/cache'
import {
  endMeeting, execute, getLiveState, headlineCascade, headlinePost, idsFocus, idsResolve, idsSetStep, idsStart, isMovaraError, issueUpdate, meetingCapture, meetingDropToIssue,
  meetingEndDay, meetingJoin, meetingNextSection, meetingSetQuarterGrade, meetingSetTeamHealth, meetingStartDay, priorityCreate, meetingPause, meetingRate, meetingResume, meetingReviewHeadline, meetingSetSection, meetingSetSettings, meetingSetShared,
  meetingStart, prioritySetStatus, todoComplete, todoUncomplete,
} from '@movara/core'
import { loadBundle } from '@/components/meetings/bundle'
import type { ActionResult } from '@/components/meetings/types'
import { getCtx } from '@/lib/ctx'

export type MeetingOp =
  | { k: 'start' }
  | { k: 'join' }
  | { k: 'pause' }
  | { k: 'resume' }
  | { k: 'next' }
  | { k: 'section'; index: number }
  | { k: 'drop'; type: 'metric' | 'priority' | 'headline' | 'todo'; id: string }
  | { k: 'review_headline'; id: string }
  | { k: 'priority_status'; id: string; status: 'on_track' | 'off_track' | 'done' | 'not_done' | 'dropped' }
  | { k: 'todo'; id: string; done: boolean }
  | { k: 'focus'; issueIds: string[] }
  | { k: 'ids_start'; issueId: string }
  | { k: 'capture_todo'; issueId?: string; title: string; ownerId: string; dueDate?: string }
  | { k: 'capture_issue'; title: string; ownerId?: string; long?: boolean }
  | { k: 'end_day' }
  | { k: 'start_day' }
  | { k: 'quarter_grade'; personId: string; score: number | null }
  | { k: 'team_health'; personId: string; rating: number | null; note?: string }
  | { k: 'priority_create'; title: string; ownerId: string; level: 'company' | 'individual'; quarter: string }
  | { k: 'priority_drop'; id: string; title: string }
  | { k: 'ids_step'; step: 'identify' | 'discuss' | 'solve' }
  | { k: 'shared'; personId: string; shared: boolean }
  | { k: 'resolve'; issueId: string; solved: boolean }
  | { k: 'notes'; issueId: string; description: string }
  | { k: 'rate'; score: number }
  | { k: 'settings'; sendRecap?: boolean; clearItems?: boolean; focusIssueCount?: number }
  | { k: 'cascade'; text: string; teamIds: string[] }
  | { k: 'end' }

/** One entry point for every live-meeting click: runs the core command, returns the fresh bundle. */
export async function meetingAction(slug: string, meetingId: string, op: MeetingOp): Promise<ActionResult> {
  const ctx = await getCtx(slug)
  try {
    switch (op.k) {
      case 'start': await execute(ctx, meetingStart, { meetingId }); break
      case 'join': await execute(ctx, meetingJoin, { meetingId }); break
      case 'pause': await execute(ctx, meetingPause, { meetingId }); break
      case 'resume': await execute(ctx, meetingResume, { meetingId }); break
      case 'next': await execute(ctx, meetingNextSection, { meetingId }); break
      case 'section': await execute(ctx, meetingSetSection, { meetingId, index: op.index }); break
      case 'drop': await execute(ctx, meetingDropToIssue, { meetingId, from: { type: op.type, id: op.id } }); break
      case 'review_headline': await execute(ctx, meetingReviewHeadline, { meetingId, headlineId: op.id }); break
      case 'priority_status': await execute(ctx, prioritySetStatus, { priorityId: op.id, status: op.status }); break
      case 'todo': await execute(ctx, op.done ? todoComplete : todoUncomplete, { todoId: op.id }); break
      case 'focus': await execute(ctx, idsFocus, { meetingId, issueIds: op.issueIds }); break
      case 'ids_start': await execute(ctx, idsStart, { meetingId, issueId: op.issueId }); break
      case 'capture_todo':
        await execute(ctx, meetingCapture, { meetingId, todos: [{ title: op.title, ownerIds: [op.ownerId], dueDate: op.dueDate || undefined }], ...(op.issueId ? { source: { type: 'issue', id: op.issueId } } : {}) })
        break
      case 'capture_issue':
        await execute(ctx, meetingCapture, { meetingId, issues: [{ title: op.title, ownerIds: op.ownerId ? [op.ownerId] : undefined, horizon: op.long ? 'long' : 'short' }] })
        break
      case 'end_day': await execute(ctx, meetingEndDay, { meetingId }); break
      case 'start_day': await execute(ctx, meetingStartDay, { meetingId }); break
      case 'quarter_grade': await execute(ctx, meetingSetQuarterGrade, { meetingId, personId: op.personId, score: op.score }); break
      case 'team_health': await execute(ctx, meetingSetTeamHealth, { meetingId, personId: op.personId, rating: op.rating, note: op.note }); break
      case 'priority_create': {
        const teamId = (await getLiveState(ctx, meetingId))!.teamId
        await execute(ctx, priorityCreate, { title: op.title, ownerId: op.ownerId, level: op.level, quarter: op.quarter, teamId })
        break
      }
      case 'priority_drop':
        await execute(ctx, meetingDropToIssue, { meetingId, from: { type: 'priority', id: op.id }, title: op.title })
        await execute(ctx, prioritySetStatus, { priorityId: op.id, status: 'dropped' })
        break
      case 'ids_step': await execute(ctx, idsSetStep, { meetingId, step: op.step }); break
      case 'shared': await execute(ctx, meetingSetShared, { meetingId, personId: op.personId, shared: op.shared }); break
      case 'resolve': await execute(ctx, idsResolve, { meetingId, issueId: op.issueId, solved: op.solved }); break
      case 'notes': await execute(ctx, issueUpdate, { issueId: op.issueId, description: op.description }); break
      case 'rate': await execute(ctx, meetingRate, { meetingId, score: op.score }); break
      case 'settings': {
        const { k: _k, ...patch } = op
        await execute(ctx, meetingSetSettings, { meetingId, ...patch })
        break
      }
      case 'cascade': {
        const r = await execute(ctx, headlinePost, { text: op.text, kind: 'general', teamId: (await loadBundle(ctx, meetingId)).live.teamId })
        if (r.ok && op.teamIds.length) await execute(ctx, headlineCascade, { headlineId: r.data[0]!.id, teamIds: op.teamIds })
        break
      }
      case 'end': {
        // Core schedules the next occurrence of a recurring series as part of meeting.end.
        await endMeeting(ctx, { meetingId })
        revalidatePath(`/${slug}/meetings`)
        break
      }
    }
    return { ok: true, bundle: await loadBundle(ctx, meetingId) }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}
