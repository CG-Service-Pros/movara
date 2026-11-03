import { and, count, desc, eq, asc } from 'drizzle-orm'
import { captureItems, meetingNotes, meetings, meetingSeries, teams } from '@movara/db'
import { requireRead, type Ctx } from '../ctx'
import { scoped } from '../helpers'
import { loadMeeting } from '../meetings/state'

export type CaptureItemRow = typeof captureItems.$inferSelect
type NotesRow = typeof meetingNotes.$inferSelect
export type MeetingNotesView = Omit<NotesRow, 'transcript'> & { hasTranscript: boolean; transcript?: string | null }

/** Notes and captured items for one meeting. The transcript (large) is only included with `includeTranscript`. */
export async function listMeetingCaptures(ctx: Ctx, meetingId: string, opts: { includeTranscript?: boolean } = {}): Promise<{ notes: MeetingNotesView[]; items: CaptureItemRow[] }> {
  requireRead(ctx)
  await loadMeeting(ctx, meetingId) // not_found across orgs
  const notes = await ctx.db.select().from(meetingNotes).where(scoped(meetingNotes, ctx, eq(meetingNotes.meetingId, meetingId))).orderBy(desc(meetingNotes.createdAt))
  const items = await ctx.db.select().from(captureItems).where(scoped(captureItems, ctx, eq(captureItems.meetingId, meetingId))).orderBy(asc(captureItems.createdAt), asc(captureItems.id))
  return {
    notes: notes.map(({ transcript, ...n }) => ({ ...n, hasTranscript: !!transcript, ...(opts.includeTranscript ? { transcript } : {}) })),
    items,
  }
}

export type PendingCapture = CaptureItemRow & {
  meeting: { id: string; title: string; scheduledAt: Date; teamId: string; teamName: string }
  notes: { id: string; sourceApp: string; sourceUrl: string | null; title: string | null }
}

/** Org-wide proposals still waiting for a decision, newest first (for the inbox badge and review screen). */
export async function listPendingCaptures(ctx: Ctx, opts: { limit?: number; meetingId?: string } = {}): Promise<{ count: number; items: PendingCapture[] }> {
  requireRead(ctx)
  const where = scoped(captureItems, ctx, eq(captureItems.status, 'proposed'), opts.meetingId ? eq(captureItems.meetingId, opts.meetingId) : undefined)
  const rows = await ctx.db
    .select({ item: captureItems, mId: meetings.id, mAt: meetings.scheduledAt, sName: meetingSeries.name, teamId: meetingSeries.teamId, teamName: teams.name, nId: meetingNotes.id, sourceApp: meetingNotes.sourceApp, sourceUrl: meetingNotes.sourceUrl, nTitle: meetingNotes.title })
    .from(captureItems)
    .innerJoin(meetings, eq(meetings.id, captureItems.meetingId))
    .innerJoin(meetingSeries, eq(meetingSeries.id, meetings.seriesId))
    .innerJoin(teams, eq(teams.id, meetingSeries.teamId))
    .innerJoin(meetingNotes, eq(meetingNotes.id, captureItems.notesId))
    .where(where)
    .orderBy(desc(captureItems.createdAt), asc(captureItems.id))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200))
  const [c] = await ctx.db.select({ n: count() }).from(captureItems).where(where)
  return {
    count: Number(c?.n ?? 0),
    items: rows.map((r) => ({ ...r.item, meeting: { id: r.mId, title: r.sName, scheduledAt: r.mAt, teamId: r.teamId, teamName: r.teamName }, notes: { id: r.nId, sourceApp: r.sourceApp, sourceUrl: r.sourceUrl, title: r.nTitle } })),
  }
}

/** Number of proposals waiting for review (inbox badge). */
export async function countPendingCaptures(ctx: Ctx): Promise<number> {
  requireRead(ctx)
  const [c] = await ctx.db.select({ n: count() }).from(captureItems).where(and(scoped(captureItems, ctx, eq(captureItems.status, 'proposed'))))
  return Number(c?.n ?? 0)
}
