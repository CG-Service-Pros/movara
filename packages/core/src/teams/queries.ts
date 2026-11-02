import { and, asc, eq, inArray } from 'drizzle-orm'
import { people, teamMembers, teams } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type TeamRow = typeof teams.$inferSelect
export type TeamMemberRow = { personId: string; name: string; email: string; role: 'lead' | 'member'; personRole: string }
export type TeamWithMembers = TeamRow & { members: TeamMemberRow[] }

async function withMembers(ctx: Ctx, rows: TeamRow[]): Promise<TeamWithMembers[]> {
  if (!rows.length) return []
  const ms = await ctx.db
    .select({ teamId: teamMembers.teamId, personId: people.id, name: people.name, email: people.email, role: teamMembers.role, personRole: people.role })
    .from(teamMembers)
    .innerJoin(people, and(eq(people.id, teamMembers.personId), eq(people.orgId, ctx.orgId)))
    .where(scoped(teamMembers, ctx, inArray(teamMembers.teamId, rows.map((r) => r.id))))
    .orderBy(asc(people.name))
  return rows.map((t) => ({ ...t, members: ms.filter((m) => m.teamId === t.id).map(({ teamId: _t, ...m }) => m) }))
}

export async function listTeams(ctx: Ctx): Promise<TeamWithMembers[]> {
  requireRead(ctx)
  const rows = await ctx.db.select().from(teams).where(scoped(teams, ctx)).orderBy(asc(teams.name))
  return withMembers(ctx, rows)
}

export async function getTeam(ctx: Ctx, id: string): Promise<TeamWithMembers> {
  requireRead(ctx)
  const [t] = await ctx.db.select().from(teams).where(scoped(teams, ctx, eq(teams.id, id))).limit(1)
  const [full] = await withMembers(ctx, [found(t, 'Team')])
  return full!
}

/** Teams a person belongs to (default: the acting person). Leadership team sorts first. */
export async function listTeamsForPerson(ctx: Ctx, personId: string): Promise<TeamRow[]> {
  requireRead(ctx)
  const rows = await ctx.db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(scoped(teamMembers, ctx, eq(teamMembers.personId, personId)), scoped(teams, ctx)))
  return rows.map((r) => r.team).sort((a, b) => Number(b.isLeadership) - Number(a.isLeadership) || a.name.localeCompare(b.name))
}
