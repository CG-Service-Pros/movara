import { and, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { meetings, meetingSeries } from '@motion/db'
import type { Ctx } from '../ctx'
import { scoped } from '../helpers'

/** Live-meeting plumbing used by the todos/issues/headlines areas (no dependency on the meetings commands). */

/** Ids of meetings that are currently live (started, not ended) for the given teams. */
export async function findLiveMeetingIds(ctx: Ctx, teamIds: (string | null | undefined)[]): Promise<string[]> {
  const ids = [...new Set(teamIds.filter((t): t is string => !!t))]
  if (!ids.length) return []
  const rows = await ctx.db
    .select({ id: meetings.id })
    .from(meetings)
    .innerJoin(meetingSeries, and(sql`${meetingSeries.id} = ${meetings.seriesId}`, isNull(meetingSeries.deletedAt)))
    .where(scoped(meetings, ctx, isNotNull(meetings.startedAt), isNull(meetings.endedAt), inArray(meetingSeries.teamId, ids)))
  return rows.map((r) => r.id)
}

/** Bump `state.rev` of any live meeting of these teams, so polling clients refetch. Returns how many were live. */
export async function bumpLiveRev(ctx: Ctx, teamIds: (string | null | undefined)[]): Promise<number> {
  const live = await findLiveMeetingIds(ctx, teamIds)
  if (!live.length) return 0
  await ctx.db
    .update(meetings)
    .set({ state: sql`jsonb_set(${meetings.state}, '{rev}', to_jsonb(coalesce((${meetings.state}->>'rev')::int, 0) + 1))` })
    .where(scoped(meetings, ctx, inArray(meetings.id, live)))
  return live.length
}
