import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { issues, orgs, people, teams, type Source } from '@motion/db'
import { actingPersonId, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { base, found, scoped } from '../helpers'
import type { CalendarSettings } from '../calendar'

/** Internal helpers shared by the issues, todos, headlines and meetings areas. Not exported from the barrel. */

export const sourceSchema = z.object({ type: z.string().min(1).max(40), id: z.string().min(1).max(100) })
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export async function assertPeople(ctx: Ctx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (!unique.length) return
  const rows = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, inArray(people.id, unique)))
  if (rows.length !== unique.length) throw new MotionError('not_found', 'Person not found')
}

export async function assertTeam(ctx: Ctx, id: string) {
  const [t] = await ctx.db.select().from(teams).where(scoped(teams, ctx, eq(teams.id, id))).limit(1)
  return found(t, 'Team')
}

/** Distinct owners; falls back to the acting person when none are given. */
export function ownersOrSelf(ctx: Ctx, ownerIds?: string[] | null): string[] {
  const owners = [...new Set(ownerIds ?? [])]
  return owners.length ? owners : [actingPersonId(ctx)]
}

/** Calendar settings of the acting org (no `read` scope needed: used by write paths). */
export async function orgCalendar(ctx: Ctx): Promise<CalendarSettings & { id: string }> {
  const [o] = await ctx.db
    .select({ id: orgs.id, fiscalYearStartMonth: orgs.fiscalYearStartMonth, weekStartDay: orgs.weekStartDay, quarterCalendar: orgs.quarterCalendar, timezone: orgs.timezone })
    .from(orgs)
    .where(and(eq(orgs.id, ctx.orgId), isNull(orgs.deletedAt)))
    .limit(1)
  return found(o, 'Organization')
}

export async function nextIssueRank(ctx: Ctx, teamId: string | null, horizon: 'short' | 'long'): Promise<number> {
  const [r] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${issues.rank}), 0)` })
    .from(issues)
    .where(scoped(issues, ctx, eq(issues.status, 'open'), eq(issues.horizon, horizon), teamId ? eq(issues.teamId, teamId) : isNull(issues.teamId)))
  return Number(r?.max ?? 0) + 1
}

export type NewIssue = {
  title: string
  description?: string | null
  ownerIds?: string[] | null
  teamId?: string | null
  horizon?: 'short' | 'long'
  source?: Source
}

/** Fan out one issue per owner (ranked at the bottom of the destination list). */
export async function insertIssues(ctx: Ctx, i: NewIssue) {
  const owners = ownersOrSelf(ctx, i.ownerIds)
  await assertPeople(ctx, owners)
  const teamId = i.teamId ?? null
  if (teamId) await assertTeam(ctx, teamId)
  const horizon = i.horizon ?? 'short'
  let rank = await nextIssueRank(ctx, teamId, horizon)
  return ctx.db
    .insert(issues)
    .values(owners.map((ownerId) => ({ ...base(ctx), title: i.title, description: i.description ?? null, ownerId, teamId, horizon, rank: rank++, source: i.source ?? null })))
    .returning()
}
