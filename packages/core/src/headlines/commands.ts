import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { headlines } from '@motion/db'
import type { Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { assertPeople, assertTeam } from '../issues/internal'
import { bumpLiveRev } from '../meetings/live'
import { defineCommand } from '../runner'
import { insertHeadlines } from './internal'

type HeadlineRow = typeof headlines.$inferSelect
const snap = (r: HeadlineRow) => ({ text: r.text, kind: r.kind, ownerId: r.ownerId, teamId: r.teamId, reviewedAt: r.reviewedAt })

async function load(ctx: Ctx, id: string): Promise<HeadlineRow> {
  const [r] = await ctx.db.select().from(headlines).where(scoped(headlines, ctx, eq(headlines.id, id))).limit(1)
  return found(r, 'Headline')
}

async function save(ctx: Ctx, before: HeadlineRow, patch: Partial<typeof headlines.$inferInsert>) {
  const [after] = await ctx.db.update(headlines).set({ ...patch, ...touch(headlines, ctx) }).where(scoped(headlines, ctx, eq(headlines.id, before.id))).returning()
  await bumpLiveRev(ctx, [before.teamId])
  return { data: after!, entity: { type: 'headline', id: before.id }, before: snap(before), after: snap(after!) }
}

const kind = z.enum(['customer', 'employee', 'general'])

export const headlinePost = defineCommand({
  name: 'headline.post',
  scope: 'write:headlines',
  input: z.object({
    text: z.string().trim().min(1).max(1000),
    kind: kind.default('general'),
    /** One headline is created per owner. Default: the acting person. */
    ownerIds: z.array(z.uuid()).max(50).optional(),
    teamId: z.uuid(),
  }),
  summary: (i) => `Post headline "${i.text}"`,
  run: async (ctx, input) => {
    const rows = await insertHeadlines(ctx, input)
    await bumpLiveRev(ctx, [input.teamId])
    return { data: rows, entity: { type: 'headline', id: rows[0]!.id }, before: null, after: { text: input.text, kind: input.kind, ids: rows.map((r) => r.id), teamId: input.teamId } }
  },
})

export const headlineUpdate = defineCommand({
  name: 'headline.update',
  scope: 'write:headlines',
  input: z.object({ headlineId: z.uuid(), text: z.string().trim().min(1).max(1000).optional(), kind: kind.optional(), ownerId: z.uuid().nullable().optional() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.headlineId)
    assertVersion(before, h.expectedVersion)
    if (input.ownerId) await assertPeople(ctx, [input.ownerId])
    const { headlineId: _id, ...patch } = input
    return save(ctx, before, patch)
  },
})

export const headlineMarkReviewed = defineCommand({
  name: 'headline.mark_reviewed',
  scope: 'write:headlines',
  input: z.object({ headlineId: z.uuid(), /** false = back to "to review". */ reviewed: z.boolean().default(true) }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.headlineId)
    assertVersion(before, h.expectedVersion)
    if (!!before.reviewedAt === input.reviewed) return { data: before, entity: { type: 'headline', id: before.id } }
    return save(ctx, before, { reviewedAt: input.reviewed ? new Date() : null })
  },
})

/** Copy a headline to other team(s); copies point back via cascaded_from_id. Teams that already have a copy are skipped. */
export const headlineCascade = defineCommand({
  name: 'headline.cascade',
  scope: 'write:headlines',
  input: z.object({ headlineId: z.uuid(), teamIds: z.array(z.uuid()).min(1).max(20) }),
  run: async (ctx, input) => {
    const src = await load(ctx, input.headlineId)
    const origin = src.cascadedFromId ?? src.id
    const teamIds = [...new Set(input.teamIds)].filter((t) => t !== src.teamId)
    if (!teamIds.length) throw new MotionError('validation', 'Choose at least one team other than the headline\'s own team')
    for (const t of teamIds) await assertTeam(ctx, t)
    const existing = await ctx.db
      .select({ teamId: headlines.teamId })
      .from(headlines)
      .where(scoped(headlines, ctx, eq(headlines.cascadedFromId, origin), inArray(headlines.teamId, teamIds)))
    const have = new Set(existing.map((e) => e.teamId))
    const todo = teamIds.filter((t) => !have.has(t))
    const rows = todo.length
      ? await ctx.db
          .insert(headlines)
          .values(todo.map((teamId) => ({ ...base(ctx), text: src.text, kind: src.kind, ownerId: src.ownerId, teamId, cascadedFromId: origin })))
          .returning()
      : []
    await bumpLiveRev(ctx, todo)
    return { data: rows, entity: { type: 'headline', id: src.id }, before: null, after: { cascadedTo: todo, skipped: teamIds.filter((t) => have.has(t)), copyIds: rows.map((r) => r.id) } }
  },
})

export const headlineDelete = defineCommand({
  name: 'headline.delete',
  scope: 'write:headlines',
  input: z.object({ headlineId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.headlineId)
    assertVersion(before, h.expectedVersion)
    await ctx.db.update(headlines).set(softDelete(headlines, ctx)).where(and(eq(headlines.orgId, ctx.orgId), eq(headlines.id, before.id)))
    await bumpLiveRev(ctx, [before.teamId])
    return { data: { id: before.id }, entity: { type: 'headline', id: before.id }, before: { text: before.text }, after: null }
  },
})
