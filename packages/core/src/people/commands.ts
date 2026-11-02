import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { people, teamMembers, user, ROLES, type Db } from '@motion/db'
import { actingPersonId, hasRole, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { defineCommand } from '../runner'

const role = z.enum(ROLES)
const email = z.string().trim().toLowerCase().email()

async function ownerCount(ctx: Ctx) {
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(people).where(scoped(people, ctx, eq(people.role, 'owner')))
  return r?.n ?? 0
}

/** Add (invite) a person by email. If a Better Auth account with that email exists it is linked at once; otherwise it links on sign-up. */
export const peopleAdd = defineCommand({
  name: 'people.add',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ name: z.string().trim().min(1).max(80), email, role: role.default('member'), timezone: z.string().optional() }),
  summary: (i) => `Add ${i.name} (${i.email}) as ${i.role}`,
  run: async (ctx, input) => {
    if (input.role === 'owner' && ctx.role !== 'owner') throw new MotionError('forbidden', 'Only an owner can add another owner')
    const existing = await ctx.db.select({ id: people.id, deletedAt: people.deletedAt }).from(people).where(and(eq(people.orgId, ctx.orgId), eq(people.email, input.email))).limit(1)
    if (existing[0] && !existing[0].deletedAt) throw new MotionError('conflict', 'Someone with that email is already a member')
    const [u] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.email, input.email)).limit(1)
    if (existing[0]) {
      // Re-add a previously removed person.
      const [row] = await ctx.db
        .update(people)
        .set({ name: input.name, role: input.role, userId: u?.id ?? null, deletedAt: null, ...touch(people, ctx) })
        .where(and(eq(people.orgId, ctx.orgId), eq(people.id, existing[0].id)))
        .returning()
      return { data: row!, entity: { type: 'person', id: row!.id }, after: { name: row!.name, email: row!.email, role: row!.role } }
    }
    const [row] = await ctx.db.insert(people).values({ ...base(ctx), name: input.name, email: input.email, role: input.role, userId: u?.id ?? null, timezone: input.timezone }).returning()
    return { data: row!, entity: { type: 'person', id: row!.id }, before: null, after: { name: row!.name, email: row!.email, role: row!.role } }
  },
})

export const peopleUpdateRole = defineCommand({
  name: 'people.update_role',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ personId: z.uuid(), role }),
  summary: (i) => `Change role of ${i.personId} to ${i.role}`,
  run: async (ctx, input, h) => {
    const [p] = await ctx.db.select().from(people).where(scoped(people, ctx, eq(people.id, input.personId))).limit(1)
    const before = found(p, 'Person')
    assertVersion(before, h.expectedVersion)
    if ((input.role === 'owner' || before.role === 'owner') && ctx.role !== 'owner') throw new MotionError('forbidden', 'Only an owner can change owner roles')
    if (before.role === 'owner' && input.role !== 'owner' && (await ownerCount(ctx)) <= 1) throw new MotionError('conflict', 'An organization needs at least one owner')
    const [after] = await ctx.db.update(people).set({ role: input.role, ...touch(people, ctx) }).where(scoped(people, ctx, eq(people.id, input.personId))).returning()
    return { data: after!, entity: { type: 'person', id: after!.id }, before: { role: before.role }, after: { role: after!.role } }
  },
})

/** Profile edits. A person can edit themself; admins can edit anyone. */
export const peopleUpdate = defineCommand({
  name: 'people.update',
  scope: 'admin',
  minRole: 'member',
  input: z.object({
    personId: z.uuid(),
    name: z.string().trim().min(1).max(80).optional(),
    timezone: z.string().nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    reminderSchedule: z.object({ enabled: z.boolean().optional(), day: z.number().int().min(0).max(6).optional(), time: z.string().optional() }).optional(),
  }),
  run: async (ctx, input, h) => {
    if (input.personId !== actingPersonId(ctx) && !hasRole(ctx, 'admin')) throw new MotionError('forbidden', 'You can only edit your own profile')
    const [p] = await ctx.db.select().from(people).where(scoped(people, ctx, eq(people.id, input.personId))).limit(1)
    const before = found(p, 'Person')
    assertVersion(before, h.expectedVersion)
    const { personId: _id, ...patch } = input
    const [after] = await ctx.db.update(people).set({ ...patch, ...touch(people, ctx) }).where(scoped(people, ctx, eq(people.id, input.personId))).returning()
    return { data: after!, entity: { type: 'person', id: after!.id }, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> }
  },
})

/** Soft-removes the person and their team memberships. The last owner cannot be removed. */
export const peopleRemove = defineCommand({
  name: 'people.remove',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ personId: z.uuid() }),
  summary: (i) => `Remove member ${i.personId}`,
  run: async (ctx, input, h) => {
    const [p] = await ctx.db.select().from(people).where(scoped(people, ctx, eq(people.id, input.personId))).limit(1)
    const before = found(p, 'Person')
    assertVersion(before, h.expectedVersion)
    if (before.role === 'owner') {
      if (ctx.role !== 'owner') throw new MotionError('forbidden', 'Only an owner can remove an owner')
      if ((await ownerCount(ctx)) <= 1) throw new MotionError('conflict', 'An organization needs at least one owner')
    }
    await ctx.db.update(people).set(softDelete(people, ctx)).where(scoped(people, ctx, eq(people.id, input.personId)))
    await ctx.db.update(teamMembers).set(softDelete(teamMembers, ctx)).where(scoped(teamMembers, ctx, eq(teamMembers.personId, input.personId)))
    return { data: { id: input.personId }, entity: { type: 'person', id: input.personId }, before: { name: before.name, email: before.email, role: before.role }, after: null }
  },
})

/**
 * Account linking: call after a Better Auth user is created (sign-up hook). Links every
 * not-yet-linked person with the same email, in any org. Not a command: no org context.
 */
export async function linkUserByEmail(db: Db, u: { id: string; email: string }): Promise<number> {
  const rows = await db
    .update(people)
    .set({ userId: u.id, updatedAt: new Date() })
    .where(and(eq(people.email, u.email.toLowerCase()), isNull(people.userId), isNull(people.deletedAt)))
    .returning({ id: people.id })
  return rows.length
}
