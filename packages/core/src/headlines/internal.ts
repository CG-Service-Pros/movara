import { headlines } from '@motion/db'
import type { Ctx } from '../ctx'
import { base } from '../helpers'
import { assertPeople, assertTeam, ownersOrSelf } from '../issues/internal'

export type NewHeadline = { text: string; kind?: 'customer' | 'employee' | 'general'; ownerIds?: string[] | null; teamId: string }

/** Fan out one headline per owner. */
export async function insertHeadlines(ctx: Ctx, h: NewHeadline) {
  const owners = ownersOrSelf(ctx, h.ownerIds)
  await assertPeople(ctx, owners)
  await assertTeam(ctx, h.teamId)
  return ctx.db
    .insert(headlines)
    .values(owners.map((ownerId) => ({ ...base(ctx), text: h.text, kind: h.kind ?? ('general' as const), ownerId, teamId: h.teamId })))
    .returning()
}
