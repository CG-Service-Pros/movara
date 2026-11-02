import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { people, teamMembers, teams } from '@motion/db'
import { MotionError } from '../errors'
import type { Ctx } from '../ctx'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { defineCommand } from '../runner'

async function mustHavePerson(ctx: Ctx, id: string) {
  const [p] = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, eq(people.id, id))).limit(1)
  found(p, 'Person')
}
async function mustHaveTeam(ctx: Ctx, id: string) {
  const [t] = await ctx.db.select().from(teams).where(scoped(teams, ctx, eq(teams.id, id))).limit(1)
  return found(t, 'Team')
}

export const teamsCreate = defineCommand({
  name: 'teams.create',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({
    name: z.string().trim().min(1).max(80),
    parentTeamId: z.uuid().nullable().optional(),
    leaderId: z.uuid().nullable().optional(),
    isLeadership: z.boolean().default(false),
    memberIds: z.array(z.uuid()).default([]),
  }),
  run: async (ctx, input) => {
    if (input.parentTeamId) await mustHaveTeam(ctx, input.parentTeamId)
    const memberIds = [...new Set([...input.memberIds, ...(input.leaderId ? [input.leaderId] : [])])]
    for (const id of memberIds) await mustHavePerson(ctx, id)
    const [row] = await ctx.db.insert(teams).values({ ...base(ctx), name: input.name, parentTeamId: input.parentTeamId ?? null, leaderId: input.leaderId ?? null, isLeadership: input.isLeadership }).returning()
    if (memberIds.length) {
      await ctx.db.insert(teamMembers).values(memberIds.map((personId) => ({ ...base(ctx), teamId: row!.id, personId, role: personId === input.leaderId ? ('lead' as const) : ('member' as const) })))
    }
    return { data: row!, entity: { type: 'team', id: row!.id }, before: null, after: { name: row!.name, isLeadership: row!.isLeadership, memberIds } }
  },
})

export const teamsUpdate = defineCommand({
  name: 'teams.update',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({
    teamId: z.uuid(),
    name: z.string().trim().min(1).max(80).optional(),
    parentTeamId: z.uuid().nullable().optional(),
    leaderId: z.uuid().nullable().optional(),
    isLeadership: z.boolean().optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await mustHaveTeam(ctx, input.teamId)
    assertVersion(before, h.expectedVersion)
    if (input.parentTeamId) {
      if (input.parentTeamId === input.teamId) throw new MotionError('validation', 'A team cannot be its own parent')
      await mustHaveTeam(ctx, input.parentTeamId)
    }
    if (input.leaderId) await mustHavePerson(ctx, input.leaderId)
    const { teamId, ...patch } = input
    const [after] = await ctx.db.update(teams).set({ ...patch, ...touch(teams, ctx) }).where(scoped(teams, ctx, eq(teams.id, teamId))).returning()
    return { data: after!, entity: { type: 'team', id: teamId }, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> }
  },
})

export const teamsDelete = defineCommand({
  name: 'teams.delete',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ teamId: z.uuid() }),
  summary: (i) => `Delete team ${i.teamId}`,
  run: async (ctx, input, h) => {
    const before = await mustHaveTeam(ctx, input.teamId)
    assertVersion(before, h.expectedVersion)
    if (before.isLeadership) throw new MotionError('conflict', 'The leadership team cannot be deleted')
    await ctx.db.update(teams).set(softDelete(teams, ctx)).where(scoped(teams, ctx, eq(teams.id, input.teamId)))
    await ctx.db.update(teamMembers).set(softDelete(teamMembers, ctx)).where(scoped(teamMembers, ctx, eq(teamMembers.teamId, input.teamId)))
    return { data: { id: input.teamId }, entity: { type: 'team', id: input.teamId }, before: { name: before.name }, after: null }
  },
})

/** Add a person to a team, or change their team role if already a member. */
export const teamsAddMember = defineCommand({
  name: 'teams.add_member',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ teamId: z.uuid(), personId: z.uuid(), role: z.enum(['lead', 'member']).default('member') }),
  run: async (ctx, input) => {
    await mustHaveTeam(ctx, input.teamId)
    await mustHavePerson(ctx, input.personId)
    const [existing] = await ctx.db.select().from(teamMembers).where(and(eq(teamMembers.orgId, ctx.orgId), eq(teamMembers.teamId, input.teamId), eq(teamMembers.personId, input.personId))).limit(1)
    let row
    if (existing) {
      ;[row] = await ctx.db.update(teamMembers).set({ role: input.role, deletedAt: null, ...touch(teamMembers, ctx) }).where(eq(teamMembers.id, existing.id)).returning()
    } else {
      ;[row] = await ctx.db.insert(teamMembers).values({ ...base(ctx), teamId: input.teamId, personId: input.personId, role: input.role }).returning()
    }
    return { data: row!, entity: { type: 'team', id: input.teamId }, before: existing ? { role: existing.role, active: !existing.deletedAt } : null, after: { personId: input.personId, role: input.role, active: true } }
  },
})

export const teamsRemoveMember = defineCommand({
  name: 'teams.remove_member',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ teamId: z.uuid(), personId: z.uuid() }),
  run: async (ctx, input) => {
    const [existing] = await ctx.db.select().from(teamMembers).where(scoped(teamMembers, ctx, eq(teamMembers.teamId, input.teamId), eq(teamMembers.personId, input.personId))).limit(1)
    found(existing, 'Team member')
    await ctx.db.update(teamMembers).set(softDelete(teamMembers, ctx)).where(eq(teamMembers.id, existing!.id))
    return { data: { teamId: input.teamId, personId: input.personId }, entity: { type: 'team', id: input.teamId }, before: { personId: input.personId, role: existing!.role }, after: null }
  },
})
