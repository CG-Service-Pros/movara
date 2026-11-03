import { eq } from 'drizzle-orm'
import { meetings, meetingSeries, type AgendaItemJson, type MeetingState } from '@movara/db'
import type { Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { found, scoped, touch } from '../helpers'
import { DEFAULT_FOCUS_ISSUE_COUNT, type SectionTimer, type StoredMeetingState } from './types'

export type MeetingRow = typeof meetings.$inferSelect
export type SeriesRow = typeof meetingSeries.$inferSelect

/** Normalize whatever is in `meetings.state` (also the seed's sparse shapes) into the full shape. */
export function readState(raw: MeetingState | null | undefined, fallbackAgenda: AgendaItemJson[] = []): StoredMeetingState {
  const s = (raw ?? {}) as Partial<StoredMeetingState> & Record<string, unknown>
  const ids = (s.idsState ?? {}) as Partial<StoredMeetingState['idsState']>
  return {
    rev: typeof s.rev === 'number' ? s.rev : 0,
    sectionIndex: typeof s.sectionIndex === 'number' ? s.sectionIndex : 0,
    agenda: Array.isArray(s.agenda) && s.agenda.length ? s.agenda : fallbackAgenda,
    timers: (s.timers as Record<string, SectionTimer>) ?? {},
    paused: !!s.paused,
    presence: s.presence ?? {},
    settings: { sendRecap: true, clearItems: true, focusIssueCount: DEFAULT_FOCUS_ISSUE_COUNT, ...(s.settings ?? {}) },
    focusIssueIds: Array.isArray(s.focusIssueIds) ? s.focusIssueIds : [],
    idsState: {
      status: ids.status ?? 'idle',
      step: ids.step ?? (ids.currentIssueId ? 'discuss' : 'identify'),
      currentIssueId: ids.currentIssueId ?? null,
      discussedIssueIds: ids.discussedIssueIds ?? [],
      solvedIssueIds: ids.solvedIssueIds ?? [],
      addedIssueIds: ids.addedIssueIds ?? [],
      resolutions: ids.resolutions ?? {},
    },
    newTodoIds: s.newTodoIds ?? [],
    newHeadlineIds: s.newHeadlineIds ?? [],
    reviewedHeadlineIds: s.reviewedHeadlineIds ?? [],
    sharedIds: s.sharedIds ?? [],
    quarterGrades: s.quarterGrades ?? {},
    teamHealth: s.teamHealth ?? {},
    dayBreak: !!s.dayBreak,
    endedDays: s.endedDays ?? [],
    stats: s.stats,
  }
}

/** The day (1 or 2) a section belongs to; single-day agendas are all day 1. */
export const dayOf = (agenda: AgendaItemJson[], index: number): 1 | 2 => agenda[index]?.day ?? 1

export const elapsedOf = (t: SectionTimer | undefined, nowMs: number): number =>
  (t?.elapsedMs ?? 0) + (t?.runningSince ? Math.max(0, nowMs - new Date(t.runningSince).getTime()) : 0)

/** Stop the running timer of a section (accumulating elapsed). */
export function stopTimer(s: StoredMeetingState, index: number, now: Date): void {
  const t = s.timers[String(index)]
  if (t?.runningSince) s.timers[String(index)] = { elapsedMs: elapsedOf(t, now.getTime()), runningSince: null }
}
export function startTimer(s: StoredMeetingState, index: number, now: Date): void {
  const t = s.timers[String(index)] ?? { elapsedMs: 0, runningSince: null }
  s.timers[String(index)] = { elapsedMs: t.elapsedMs, runningSince: s.paused ? null : now.toISOString() }
}

export type Loaded = { meeting: MeetingRow; series: SeriesRow; state: StoredMeetingState }

/** Load a meeting (row-locked when `lock`) with its series and normalized state. not_found across orgs. */
export async function loadMeeting(ctx: Ctx, meetingId: string, lock = false): Promise<Loaded> {
  const q = ctx.db.select().from(meetings).where(scoped(meetings, ctx, eq(meetings.id, meetingId))).limit(1)
  const [meeting] = lock ? await q.for('update') : await q
  found(meeting, 'Meeting')
  const [series] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, meeting!.seriesId))).limit(1)
  found(series, 'Meeting series')
  return { meeting: meeting!, series: series!, state: readState(meeting!.state, series!.agenda) }
}

export const isLive = (m: MeetingRow) => !!m.startedAt && !m.endedAt

export function requireLive(m: MeetingRow): void {
  if (!m.startedAt) throw new MovaraError('conflict', 'The meeting has not started')
  if (m.endedAt) throw new MovaraError('conflict', 'The meeting has ended')
}

/** Persist state, bumping `rev`. `extra` can set other columns (startedAt, ratings, ...). */
export async function saveState(ctx: Ctx, l: Loaded, extra: Partial<typeof meetings.$inferInsert> = {}): Promise<MeetingRow> {
  l.state.rev += 1
  const [row] = await ctx.db
    .update(meetings)
    .set({ ...extra, state: l.state as unknown as MeetingState, ...touch(meetings, ctx) })
    .where(scoped(meetings, ctx, eq(meetings.id, l.meeting.id)))
    .returning()
  l.meeting = row!
  return row!
}
