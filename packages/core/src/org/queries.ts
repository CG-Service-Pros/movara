import { and, eq, isNull } from 'drizzle-orm'
import { orgs, type Db } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { found } from '../helpers'

export type OrgRow = typeof orgs.$inferSelect

export const TERMINOLOGY_HISTORY_MAX = 10

/**
 * The terminology packs applied before the current one, oldest first (the last entry is what "Revert" goes back to).
 * `null` entries are the built-in Standard pack. Stored in `settings.terminologyHistory` ("Use Standard" is just another step on the stack); orgs from before the stack
 * existed fall back to the single `terminologyPreviousPack`.
 */
export function terminologyHistoryOf(org: Pick<OrgRow, 'settings' | 'terminologyPack' | 'terminologyPreviousPack'>): (NonNullable<OrgRow['terminologyPack']> | null)[] {
  const h = org.settings?.terminologyHistory
  const list = Array.isArray(h) ? (h as (NonNullable<OrgRow['terminologyPack']> | null)[]) : org.terminologyPack || org.terminologyPreviousPack ? [org.terminologyPreviousPack ?? null] : []
  // Entries identical to the active pack are not something to revert to.
  const cur = org.terminologyPack
  const same = (p: (typeof list)[number]) => (p === null ? cur === null : !!cur && cur.id === p.id && cur.version === p.version)
  let end = list.length
  while (end > 0 && same(list[end - 1]!)) end--
  return list.slice(0, end)
}

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

