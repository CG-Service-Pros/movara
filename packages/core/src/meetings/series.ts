import { and, asc, desc, eq, gte, isNull, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { STANDARD_PACK } from '@motion/terminology'
import { meetings, meetingSeries, orgs, teamMembers, type AgendaItemJson } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, touch } from '../helpers'
import { assertPeople, assertTeam, orgCalendar } from '../issues/internal'
import { defineCommand } from '../runner'
import { nextOccurrence, validateRrule } from './schedule'
import type { SeriesRow, MeetingRow } from './state'

export type MeetingTemplate = { key: string; name: string; agenda: AgendaItemJson[] }

/** Meeting templates: the org's resolved terminology pack first, then the Standard pack's. */
export async function listMeetingTemplates(ctx: Ctx): Promise<MeetingTemplate[]> {
  requireRead(ctx)
  return orgTemplates(ctx)
}

async function orgTemplates(ctx: Ctx): Promise<MeetingTemplate[]> {
  const [o] = await ctx.db.select({ pack: orgs.terminologyPack }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
  const own = o?.pack?.meetingTemplates ?? []
  const std = STANDARD_PACK.meetingTemplates ?? []
  return [...own, ...std.filter((t) => !own.some((x) => x.key === t.key))] as MeetingTemplate[]
}

const agendaSchema = z.array(z.object({ term: z.string().min(1).max(60), minutes: z.number().int().min(1).max(480) })).min(1).max(30)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM')
const actorSchema = z.object({ type: z.enum(['person', 'agent']), id: z.uuid(), onBehalfOf: z.uuid().optional() })

/** Create the next occurrence of a series (rrule, or the explicit time). Returns the existing upcoming one if there is. */
export async function createNextOccurrence(ctx: Ctx, series: SeriesRow, at?: Date): Promise<{ meeting: MeetingRow; created: boolean }> {
  const now = new Date()
  if (!at) {
    // An upcoming (or still-live) unstarted/ongoing occurrence already exists: reuse it.
    const [open] = await ctx.db
      .select()
      .from(meetings)
      .where(scoped(meetings, ctx, eq(meetings.seriesId, series.id), isNull(meetings.endedAt), gte(meetings.scheduledAt, new Date(now.getTime() - 12 * 3600_000))))
      .orderBy(asc(meetings.scheduledAt))
      .limit(1)
    if (open) return { meeting: open, created: false }
    const cal = await orgCalendar(ctx)
    at = nextOccurrence(series.rrule, series.startTime, cal.timezone ?? 'UTC', now) ?? undefined
    if (!at) throw new MotionError('validation', 'This series is ad-hoc (no rrule): provide scheduledAt')
  }
  const [row] = await ctx.db
    .insert(meetings)
    .values({ ...base(ctx), seriesId: series.id, scheduledAt: at, state: { rev: 0, agenda: series.agenda, settings: { sendRecap: true, clearItems: true, focusIssueCount: 3 } } })
    .returning()
  return { meeting: row!, created: true }
}

export const meetingSeriesCreate = defineCommand({
  name: 'meeting_series.create',
  scope: 'write:meetings',
  minRole: 'admin',
  input: z.object({
    teamId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    /** Template key from the org's terminology pack (default 'weekly'). Ignored when `agenda` is given. */
    templateKey: z.string().min(1).max(60).default('weekly'),
    /** Custom agenda (overrides the template). */
    agenda: agendaSchema.optional(),
    /** Weekly iCalendar rule, e.g. FREQ=WEEKLY;BYDAY=MO. Empty/null = ad-hoc. */
    rrule: z.string().nullable().optional(),
    startTime: timeSchema.nullable().optional(),
    durationMinutes: z.number().int().min(5).max(600).default(90),
    /** Default: the team's members. */
    attendeeIds: z.array(z.uuid()).max(200).optional(),
    facilitatorId: z.uuid().nullable().optional(),
    scribeActor: actorSchema.nullable().optional(),
    /** Schedule the first occurrence at this instant (default: next rrule slot). */
    firstScheduledAt: z.coerce.date().optional(),
  }),
  summary: (i) => `Create meeting series "${i.name}"`,
  run: async (ctx, input) => {
    await assertTeam(ctx, input.teamId)
    let agenda: AgendaItemJson[]
    let templateKey = input.templateKey
    if (input.agenda) {
      agenda = input.agenda
      if (!input.templateKey || input.templateKey === 'weekly') templateKey = 'custom'
    } else {
      const t = (await orgTemplates(ctx)).find((x) => x.key === input.templateKey)
      if (!t) throw new MotionError('validation', `Unknown meeting template "${input.templateKey}"`)
      agenda = t.agenda
    }
    const rrule = validateRrule(input.rrule)
    const attendeeIds = input.attendeeIds
      ? [...new Set(input.attendeeIds)]
      : (await ctx.db.select({ id: teamMembers.personId }).from(teamMembers).where(scoped(teamMembers, ctx, eq(teamMembers.teamId, input.teamId)))).map((r) => r.id)
    await assertPeople(ctx, [...attendeeIds, ...(input.facilitatorId ? [input.facilitatorId] : [])])
    const [series] = await ctx.db
      .insert(meetingSeries)
      .values({
        ...base(ctx),
        teamId: input.teamId,
        name: input.name,
        templateKey,
        agenda,
        rrule,
        startTime: input.startTime ?? null,
        durationMinutes: input.durationMinutes,
        attendeeIds,
        facilitatorId: input.facilitatorId ?? null,
        scribeActor: input.scribeActor ?? null,
      })
      .returning()
    let first: MeetingRow | null = null
    if (input.firstScheduledAt || rrule) first = (await createNextOccurrence(ctx, series!, input.firstScheduledAt)).meeting
    return {
      data: { series: series!, firstMeeting: first },
      entity: { type: 'meeting_series', id: series!.id },
      before: null,
      after: { name: series!.name, teamId: series!.teamId, templateKey, rrule, attendeeIds, facilitatorId: series!.facilitatorId },
    }
  },
})

export const meetingSeriesUpdate = defineCommand({
  name: 'meeting_series.update',
  scope: 'write:meetings',
  minRole: 'admin',
  input: z.object({
    seriesId: z.uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    agenda: agendaSchema.optional(),
    rrule: z.string().nullable().optional(),
    startTime: timeSchema.nullable().optional(),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    attendeeIds: z.array(z.uuid()).max(200).optional(),
    facilitatorId: z.uuid().nullable().optional(),
    scribeActor: actorSchema.nullable().optional(),
  }),
  run: async (ctx, input, h) => {
    const [before] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, input.seriesId))).limit(1)
    found(before, 'Meeting series')
    assertVersion(before!, h.expectedVersion)
    const { seriesId, rrule, ...rest } = input
    await assertPeople(ctx, [...(input.attendeeIds ?? []), ...(input.facilitatorId ? [input.facilitatorId] : [])])
    const patch = { ...rest, ...(rrule !== undefined ? { rrule: validateRrule(rrule) } : {}), ...(input.agenda ? { templateKey: 'custom' } : {}) }
    const [after] = await ctx.db.update(meetingSeries).set({ ...patch, ...touch(meetingSeries, ctx) }).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, seriesId))).returning()
    return { data: after!, entity: { type: 'meeting_series', id: seriesId }, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> }
  },
})

/** Schedule the next occurrence (from the rrule), or one at an explicit time. Reuses an already-upcoming occurrence. */
export const meetingScheduleNext = defineCommand({
  name: 'meeting.schedule_next',
  scope: 'write:meetings',
  input: z.object({ seriesId: z.uuid(), scheduledAt: z.coerce.date().optional() }),
  run: async (ctx, input) => {
    const [series] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, input.seriesId))).limit(1)
    found(series, 'Meeting series')
    const r = await createNextOccurrence(ctx, series!, input.scheduledAt)
    return { data: r, entity: { type: 'meeting', id: r.meeting.id }, before: null, after: r.created ? { seriesId: series!.id, scheduledAt: r.meeting.scheduledAt.toISOString() } : null }
  },
})

// ---- queries ----

export async function listMeetingSeries(ctx: Ctx, input: { teamId?: string } = {}): Promise<SeriesRow[]> {
  requireRead(ctx)
  const extra: (SQL | undefined)[] = [input.teamId ? eq(meetingSeries.teamId, input.teamId) : undefined]
  return ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, ...extra)).orderBy(asc(meetingSeries.name))
}

export async function getMeetingSeries(ctx: Ctx, id: string): Promise<SeriesRow & { upcoming: MeetingRow[] }> {
  requireRead(ctx)
  const [s] = await ctx.db.select().from(meetingSeries).where(scoped(meetingSeries, ctx, eq(meetingSeries.id, id))).limit(1)
  found(s, 'Meeting series')
  const upcoming = await ctx.db
    .select()
    .from(meetings)
    .where(scoped(meetings, ctx, eq(meetings.seriesId, id), isNull(meetings.endedAt)))
    .orderBy(asc(meetings.scheduledAt))
    .limit(5)
  return { ...s!, upcoming }
}

export type MeetingListItem = MeetingRow & { seriesName: string; teamId: string; status: 'scheduled' | 'live' | 'ended' }

/** Meetings (occurrences). status: 'upcoming' (not ended), 'live', 'past' (ended). */
export async function listMeetings(ctx: Ctx, input: { seriesId?: string; teamId?: string; status?: 'upcoming' | 'live' | 'past'; limit?: number } = {}): Promise<MeetingListItem[]> {
  requireRead(ctx)
  const rows = await ctx.db
    .select({ m: meetings, name: meetingSeries.name, teamId: meetingSeries.teamId })
    .from(meetings)
    .innerJoin(meetingSeries, and(eq(meetingSeries.id, meetings.seriesId), isNull(meetingSeries.deletedAt)))
    .where(scoped(meetings, ctx, input.seriesId ? eq(meetings.seriesId, input.seriesId) : undefined, input.teamId ? eq(meetingSeries.teamId, input.teamId) : undefined))
    .orderBy(input.status === 'past' ? desc(meetings.scheduledAt) : asc(meetings.scheduledAt))
  const items = rows.map((r) => ({ ...r.m, seriesName: r.name, teamId: r.teamId, status: (r.m.endedAt ? 'ended' : r.m.startedAt ? 'live' : 'scheduled') as 'scheduled' | 'live' | 'ended' }))
  const f = input.status
  const out = f === 'past' ? items.filter((i) => i.status === 'ended') : f === 'live' ? items.filter((i) => i.status === 'live') : f === 'upcoming' ? items.filter((i) => i.status !== 'ended') : items
  return out.slice(0, Math.min(input.limit ?? 100, 500))
}

