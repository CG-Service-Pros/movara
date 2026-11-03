import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditEvents, orgs, people, teamMembers, teams, user, type Db } from '@motion/db'
import { ctxForPerson, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { newId } from '../helpers'

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/
const RESERVED_SLUGS = new Set(['api', 'app', 'new', 'onboarding', 'sign-in', 'sign-up', 'settings', 'admin', 'www', 'mcp', '_next', 'oauth', 'static', 'public', 'favicon'])

export const createOrgInput = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, 'Use 3-40 lowercase letters, numbers and dashes'),
  timezone: z
    .string()
    .default('UTC')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz })
        return true
      } catch {
        return false
      }
    }, 'Unknown timezone'),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  weekStartDay: z.number().int().min(0).max(6).default(1),
  /** Better Auth user id of the owner (they must exist). */
  ownerUserId: z.string().min(1),
  /** Defaults to the user's name/email. */
  ownerName: z.string().trim().min(1).optional(),
  ownerEmail: z.string().email().optional(),
})

/**
 * Create an org with its owner person and a default "Leadership team". Not a runner command
 * (there is no org to scope it to yet) but it writes the same audit event.
 * Returns a person Ctx for the new owner.
 */
export async function createOrg(db: Db, rawInput: z.input<typeof createOrgInput>): Promise<{ org: typeof orgs.$inferSelect; ctx: Ctx }> {
  const parsed = createOrgInput.safeParse(rawInput)
  if (!parsed.success) throw new MotionError('validation', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), { issues: parsed.error.issues })
  const input = parsed.data
  if (RESERVED_SLUGS.has(input.slug)) throw new MotionError('validation', 'That URL name is reserved')

  const [u] = await db.select().from(user).where(eq(user.id, input.ownerUserId)).limit(1)
  if (!u) throw new MotionError('not_found', 'User not found')
  const [taken] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, input.slug)).limit(1)
  if (taken) throw new MotionError('conflict', 'That URL name is already taken')

  const orgId = newId()
  const personId = newId()
  const teamId = newId()
  const actor = { type: 'person' as const, id: personId }
  const c = { orgId, createdByActor: actor, updatedByActor: actor }

  const org = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(orgs)
      .values({
        id: orgId,
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        weekStartDay: input.weekStartDay,
        branding: { wordmark: input.name },
        createdByActor: actor,
        updatedByActor: actor,
      })
      .returning()
    await tx.insert(people).values({ ...c, id: personId, userId: u.id, name: input.ownerName ?? u.name, email: (input.ownerEmail ?? u.email).toLowerCase(), role: 'owner' })
    await tx.insert(teams).values({ ...c, id: teamId, name: 'Leadership team', isLeadership: true, leaderId: personId })
    await tx.insert(teamMembers).values({ ...c, id: newId(), teamId, personId, role: 'lead' })
    await tx.insert(auditEvents).values({ id: newId(), orgId, actor, command: 'org.create', entityType: 'org', entityId: orgId, diff: { after: { name: input.name, slug: input.slug } } })
    return row!
  })
  return { org, ctx: await ctxForPerson(db, orgId, personId) }
}
