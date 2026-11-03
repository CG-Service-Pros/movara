import { and, asc, eq, isNull } from 'drizzle-orm'
import { orgs, people, type Db } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type PersonRow = Omit<typeof people.$inferSelect, 'inviteTokenHash'>
const strip = ({ inviteTokenHash: _h, ...rest }: typeof people.$inferSelect): PersonRow => rest

export async function listPeople(ctx: Ctx): Promise<PersonRow[]> {
  requireRead(ctx)
  return (await ctx.db.select().from(people).where(scoped(people, ctx)).orderBy(asc(people.name))).map(strip)
}

export async function getPerson(ctx: Ctx, id: string): Promise<PersonRow> {
  requireRead(ctx)
  const [p] = await ctx.db.select().from(people).where(scoped(people, ctx, eq(people.id, id))).limit(1)
  return strip(found(p, 'Person'))
}

/** Every org a Better Auth user belongs to (for the org switcher and post-login redirect). */
export async function listMembershipsForUser(db: Db, userId: string) {
  return db
    .select({
      orgId: orgs.id,
      slug: orgs.slug,
      name: orgs.name,
      branding: orgs.branding,
      personId: people.id,
      role: people.role,
    })
    .from(people)
    .innerJoin(orgs, eq(orgs.id, people.orgId))
    .where(and(eq(people.userId, userId), isNull(people.deletedAt), isNull(orgs.deletedAt)))
    .orderBy(asc(orgs.name))
}
