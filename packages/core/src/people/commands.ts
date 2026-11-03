import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { orgs, people, teamMembers, ROLES, type Db } from '@motion/db'
import { actingPersonId, hasRole, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { defineCommand } from '../runner'
import { brandImage } from '../org/commands'

const role = z.enum(ROLES)
const email = z.string().trim().toLowerCase().email()

async function ownerCount(ctx: Ctx) {
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(people).where(scoped(people, ctx, eq(people.role, 'owner')))
  return r?.n ?? 0
}

export const INVITE_TTL_DAYS = 14
const hashInvite = (token: string) => createHash('sha256').update(token).digest('hex')
function newInvite() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashInvite(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) }
}
type PersonRow = typeof people.$inferSelect
/** Never expose the token hash outside the table. */
const publicPerson = ({ inviteTokenHash: _h, ...rest }: PersonRow) => rest

/**
 * Add (invite) a person by email. The person is NEVER linked to an account by email alone: the result carries a
 * single-use `inviteToken` (shown once; only its hash is stored) that the invitee redeems at `/invite/<token>`
 * with `acceptInvite`. Valid for 14 days.
 */
export const peopleAdd = defineCommand({
  name: 'people.add',
  scope: 'admin',
  minRole: 'admin',
  redactResult: true,
  input: z.object({ name: z.string().trim().min(1).max(80), email, role: role.default('member'), timezone: z.string().optional() }),
  summary: (i) => `Add ${i.name} (${i.email}) as ${i.role}`,
  run: async (ctx, input) => {
    if (input.role === 'owner' && ctx.role !== 'owner') throw new MotionError('forbidden', 'Only an owner can add another owner')
    const existing = await ctx.db.select({ id: people.id, deletedAt: people.deletedAt }).from(people).where(and(eq(people.orgId, ctx.orgId), eq(people.email, input.email))).limit(1)
    if (existing[0] && !existing[0].deletedAt) throw new MotionError('conflict', 'Someone with that email is already a member')
    const inv = newInvite()
    if (existing[0]) {
      // Re-add a previously removed person (must redeem a fresh invite).
      const [row] = await ctx.db
        .update(people)
        .set({ name: input.name, role: input.role, userId: null, inviteTokenHash: inv.hash, inviteExpiresAt: inv.expiresAt, deletedAt: null, ...touch(people, ctx) })
        .where(and(eq(people.orgId, ctx.orgId), eq(people.id, existing[0].id)))
        .returning()
      return { data: { ...publicPerson(row!), inviteToken: inv.token }, entity: { type: 'person', id: row!.id }, after: { name: row!.name, email: row!.email, role: row!.role } }
    }
    const [row] = await ctx.db.insert(people).values({ ...base(ctx), name: input.name, email: input.email, role: input.role, userId: null, inviteTokenHash: inv.hash, inviteExpiresAt: inv.expiresAt, timezone: input.timezone }).returning()
    return { data: { ...publicPerson(row!), inviteToken: inv.token }, entity: { type: 'person', id: row!.id }, before: null, after: { name: row!.name, email: row!.email, role: row!.role } }
  },
})

/** Issue a fresh invite link for a pending (not yet joined) person. Invalidates any earlier link. The token is returned once. */
export const peopleCreateInvite = defineCommand({
  name: 'people.create_invite',
  scope: 'admin',
  minRole: 'admin',
  redactResult: true,
  input: z.object({ personId: z.uuid() }),
  summary: (i) => `Issue an invite link for ${i.personId}`,
  run: async (ctx, input) => {
    const [p] = await ctx.db.select().from(people).where(scoped(people, ctx, eq(people.id, input.personId))).limit(1)
    const person = found(p, 'Person')
    if (person.userId) throw new MotionError('conflict', 'This person has already joined')
    const inv = newInvite()
    await ctx.db.update(people).set({ inviteTokenHash: inv.hash, inviteExpiresAt: inv.expiresAt, ...touch(people, ctx) }).where(scoped(people, ctx, eq(people.id, input.personId)))
    return { data: { personId: person.id, email: person.email, name: person.name, inviteToken: inv.token, expiresAt: inv.expiresAt }, entity: { type: 'person', id: person.id }, before: null, after: { invite: 'reissued' } }
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
    avatarUrl: brandImage.nullable().optional(),
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

/** Public details of a pending invite for the `/invite/<token>` page, or null if the token is unknown, used or expired. */
export async function getInvite(db: Db, token: string) {
  if (!token || token.length > 200) return null
  const [r] = await db
    .select({ personName: people.name, email: people.email, role: people.role, orgName: orgs.name, orgSlug: orgs.slug })
    .from(people)
    .innerJoin(orgs, eq(orgs.id, people.orgId))
    .where(and(eq(people.inviteTokenHash, hashInvite(token)), isNull(people.userId), isNull(people.deletedAt), isNull(orgs.deletedAt), gt(people.inviteExpiresAt, new Date())))
    .limit(1)
  return r ?? null
}

/**
 * Redeem an invite token for a signed-in Better Auth user (the ONLY way an account is linked to an invited person).
 * Single use: the token is cleared on success. Not a command: no org context before this.
 */
export async function acceptInvite(db: Db, token: string, userId: string): Promise<{ orgId: string; slug: string; personId: string }> {
  const bad = () => new MotionError('not_found', 'This invitation link is invalid, expired or already used')
  if (!token || token.length > 200) throw bad()
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: people.id, orgId: people.orgId, slug: orgs.slug })
      .from(people)
      .innerJoin(orgs, eq(orgs.id, people.orgId))
      .where(and(eq(people.inviteTokenHash, hashInvite(token)), isNull(people.userId), isNull(people.deletedAt), isNull(orgs.deletedAt), gt(people.inviteExpiresAt, new Date())))
      .limit(1)
    if (!p) throw bad()
    const [dup] = await tx.select({ id: people.id }).from(people).where(and(eq(people.orgId, p.orgId), eq(people.userId, userId), isNull(people.deletedAt))).limit(1)
    if (dup) throw new MotionError('conflict', 'This account is already a member of that organization')
    const rows = await tx
      .update(people)
      .set({ userId, inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(people.id, p.id), isNull(people.userId), eq(people.inviteTokenHash, hashInvite(token))))
      .returning({ id: people.id })
    if (!rows[0]) throw bad()
    return { orgId: p.orgId, slug: p.slug, personId: p.id }
  })
}
