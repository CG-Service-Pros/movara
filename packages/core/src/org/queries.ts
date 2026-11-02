import { and, eq, isNull } from 'drizzle-orm'
import { orgs, type Db } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found } from '../helpers'

export type OrgRow = typeof orgs.$inferSelect

/** The acting org. */
export async function getOrg(ctx: Ctx): Promise<OrgRow> {
  requireRead(ctx)
  const [o] = await ctx.db.select().from(orgs).where(and(eq(orgs.id, ctx.orgId), isNull(orgs.deletedAt))).limit(1)
  return found(o, 'Organization')
}

/** Public lookup by slug (no ctx; for routing before a ctx exists). */
export async function getOrgBySlug(db: Db, slug: string): Promise<OrgRow | null> {
  const [o] = await db.select().from(orgs).where(and(eq(orgs.slug, slug), isNull(orgs.deletedAt))).limit(1)
  return o ?? null
}

export async function isSlugAvailable(db: Db, slug: string): Promise<boolean> {
  const [o] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1)
  return !o
}

