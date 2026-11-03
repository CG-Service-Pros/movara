import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm'
import { meetings, meetingSeries, teams } from '@movara/db'
import { requireRead, type Ctx } from '../ctx'
import { orgCalendar } from '../issues/internal'

export type MeetingMatch = {
  id: string
  title: string
  teamId: string
  teamName: string
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  status: 'scheduled' | 'live' | 'ended'
  /** True when the requested title shares words with the meeting/series/team name. */
  titleMatch: boolean
  score: number
}

export type MeetingsFindInput = {
  teamId?: string
  /** Free text, e.g. the calendar event title from Granola/Plaud. Matched loosely against the meeting name and team name. */
  title?: string
  /** YYYY-MM-DD or ISO timestamp the notes belong to (default: now). */
  date?: string
  near?: 'latest' | 'today' | 'upcoming'
  /** Search window around the anchor date. Default 7 days. */
  windowDays?: number
  limit?: number
}

const DAY = 86_400_000
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'with', 'meeting', 'sync', 'call', 'team'])
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w))
const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * Find the meeting a set of notes belongs to. Includes past and ended meetings (that is when notes arrive), within
 * +-`windowDays` (default 7) of `date` (default now). Best match first: title words, then `near` ordering or distance in time.
 */
export async function meetingsFind(ctx: Ctx, input: MeetingsFindInput = {}): Promise<MeetingMatch[]> {
  requireRead(ctx)
  const now = Date.now()
  const cal = await orgCalendar(ctx)
  const tz = cal.timezone || 'UTC'
  const dateOnly = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null
  const parsed = input.date ? (dateOnly ? Date.parse(`${dateOnly}T12:00:00Z`) : Date.parse(input.date)) : NaN
  const anchor = Number.isNaN(parsed) ? now : parsed
  const win = Math.min(Math.max(input.windowDays ?? 7, 1), 60) * DAY
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25)

  const rows = await ctx.db
    .select({ m: meetings, name: meetingSeries.name, teamId: meetingSeries.teamId, teamName: teams.name })
    .from(meetings)
    .innerJoin(meetingSeries, eq(meetingSeries.id, meetings.seriesId))
    .innerJoin(teams, eq(teams.id, meetingSeries.teamId))
    .where(and(
      eq(meetings.orgId, ctx.orgId), isNull(meetings.deletedAt), isNull(meetingSeries.deletedAt),
      gte(meetings.scheduledAt, new Date(anchor - win)), lt(meetings.scheduledAt, new Date(anchor + win)),
      input.teamId ? eq(meetingSeries.teamId, input.teamId) : undefined,
    ))
    .orderBy(asc(meetings.scheduledAt))

  const qWords = input.title ? words(input.title) : []
  const targetDay = dateOnly ?? localDate(new Date(anchor), tz)
  let list = rows.map((r) => {
    const at = r.m.scheduledAt.getTime()
    const hay = new Set(words(`${r.name} ${r.teamName}`))
    const hits = qWords.filter((w) => hay.has(w) || [...hay].some((h) => h.startsWith(w) || w.startsWith(h))).length
    const score = qWords.length ? hits / qWords.length : 0
    const status: MeetingMatch['status'] = r.m.endedAt ? 'ended' : r.m.startedAt ? 'live' : 'scheduled'
    const sameDay = localDate(r.m.scheduledAt, tz) === targetDay
    return {
      at, sameDay, dist: dateOnly && sameDay ? 0 : Math.abs(at - anchor),
      match: { id: r.m.id, title: r.name, teamId: r.teamId, teamName: r.teamName, scheduledAt: r.m.scheduledAt.toISOString(), startedAt: r.m.startedAt?.toISOString() ?? null, endedAt: r.m.endedAt?.toISOString() ?? null, status, titleMatch: score > 0, score: Math.round(score * 100) / 100 } satisfies MeetingMatch,
    }
  })

  if (input.near === 'today') list = list.filter((x) => x.sameDay)
  else if (input.near === 'latest') list = list.filter((x) => x.at <= now + 2 * 3_600_000 || x.match.status !== 'scheduled')
  else if (input.near === 'upcoming') list = list.filter((x) => x.at >= now || x.match.status === 'live')

  const byTime = input.near === 'latest' ? (a: (typeof list)[0], b: (typeof list)[0]) => b.at - a.at : input.near === 'upcoming' || input.near === 'today' ? (a: (typeof list)[0], b: (typeof list)[0]) => a.at - b.at : (a: (typeof list)[0], b: (typeof list)[0]) => a.dist - b.dist
  list.sort((a, b) => b.match.score - a.match.score || byTime(a, b))
  return list.slice(0, limit).map((x) => x.match)
}
