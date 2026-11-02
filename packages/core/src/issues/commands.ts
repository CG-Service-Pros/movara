import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { issues } from '@motion/db'
import { MotionError } from '../errors'
import type { Ctx } from '../ctx'
import { assertVersion, found, scoped, touch } from '../helpers'
import { addToLiveMeetings, bumpLiveRev } from '../meetings/live'
import { defineCommand } from '../runner'
import { assertPeople, assertTeam, insertIssues, nextIssueRank, sourceSchema } from './internal'

type IssueRow = typeof issues.$inferSelect
const snap = (r: IssueRow) => ({ title: r.title, description: r.description, ownerId: r.ownerId, teamId: r.teamId, horizon: r.horizon, rank: r.rank, status: r.status })

async function load(ctx: Ctx, id: string): Promise<IssueRow> {
  const [r] = await ctx.db.select().from(issues).where(scoped(issues, ctx, eq(issues.id, id))).limit(1)
  return found(r, 'Issue')
}

async function save(ctx: Ctx, before: IssueRow, patch: Partial<typeof issues.$inferInsert>) {
  const [after] = await ctx.db.update(issues).set({ ...patch, ...touch(issues, ctx) }).where(scoped(issues, ctx, eq(issues.id, before.id))).returning()
  await bumpLiveRev(ctx, [before.teamId, after!.teamId])
  return { data: after!, entity: { type: 'issue', id: before.id }, before: snap(before), after: snap(after!) }
}

export const issueCreate = defineCommand({
  name: 'issue.create',
  scope: 'write:issues',
  input: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10_000).nullable().optional(),
    /** One issue is created per owner. Default: the acting person. */
    ownerIds: z.array(z.uuid()).max(50).optional(),
    teamId: z.uuid().nullable().optional(),
    horizon: z.enum(['short', 'long']).default('short'),
    source: sourceSchema.nullable().optional(),
  }),
  summary: (i) => `Create issue "${i.title}"`,
  run: async (ctx, input) => {
    const rows = await insertIssues(ctx, input)
    await addToLiveMeetings(ctx, input.teamId, { issueIds: rows.map((r) => r.id) })
    return { data: rows, entity: { type: 'issue', id: rows[0]!.id }, before: null, after: { title: input.title, ids: rows.map((r) => r.id), ownerIds: rows.map((r) => r.ownerId), source: input.source ?? null } }
  },
})

export const issueUpdate = defineCommand({
  name: 'issue.update',
  scope: 'write:issues',
  input: z.object({
    issueId: z.uuid(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(10_000).nullable().optional(),
    ownerId: z.uuid().nullable().optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    if (input.ownerId) await assertPeople(ctx, [input.ownerId])
    const { issueId: _id, ...patch } = input
    return save(ctx, before, patch)
  },
})

export const issueSetRank = defineCommand({
  name: 'issue.set_rank',
  scope: 'write:issues',
  input: z.object({ issueId: z.uuid(), /** 1 = top of its list. */ rank: z.number().int().min(1).max(10_000) }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    if (before.status !== 'open') throw new MotionError('conflict', 'Only open issues can be ranked')
    const siblings = await ctx.db
      .select()
      .from(issues)
      .where(scoped(issues, ctx, eq(issues.status, 'open'), eq(issues.horizon, before.horizon), before.teamId ? eq(issues.teamId, before.teamId) : isNull(issues.teamId)))
      .orderBy(asc(issues.rank), asc(issues.createdAt), asc(issues.id))
    const order = siblings.filter((s) => s.id !== before.id)
    order.splice(Math.min(input.rank - 1, order.length), 0, before)
    for (const [idx, row] of order.entries()) {
      if (row.rank !== idx + 1) await ctx.db.update(issues).set({ rank: idx + 1, ...touch(issues, ctx) }).where(and(eq(issues.orgId, ctx.orgId), eq(issues.id, row.id)))
    }
    await bumpLiveRev(ctx, [before.teamId])
    const after = await load(ctx, before.id)
    return { data: after, entity: { type: 'issue', id: before.id }, before: { rank: before.rank }, after: { rank: after.rank } }
  },
})

export const issueSolve = defineCommand({
  name: 'issue.solve',
  scope: 'write:issues',
  input: z.object({ issueId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'solved') return { data: before, entity: { type: 'issue', id: before.id } }
    if (before.status !== 'open') throw new MotionError('conflict', 'Only open issues can be solved; reopen it first')
    return save(ctx, before, { status: 'solved', solvedAt: new Date() })
  },
})

export const issueReopen = defineCommand({
  name: 'issue.reopen',
  scope: 'write:issues',
  input: z.object({ issueId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'open') return { data: before, entity: { type: 'issue', id: before.id } }
    return save(ctx, before, { status: 'open', solvedAt: null, rank: await nextIssueRank(ctx, before.teamId, before.horizon) })
  },
})

export const issueDrop = defineCommand({
  name: 'issue.drop',
  scope: 'write:issues',
  input: z.object({ issueId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'dropped') return { data: before, entity: { type: 'issue', id: before.id } }
    if (before.status !== 'open') throw new MotionError('conflict', 'Only open issues can be dropped')
    return save(ctx, before, { status: 'dropped' })
  },
})

export const issueMove = defineCommand({
  name: 'issue.move',
  scope: 'write:issues',
  input: z
    .object({
      issueId: z.uuid(),
      /** Destination team (omit to keep). */
      teamId: z.uuid().nullable().optional(),
      /** 'long' moves it to the long-term list. */
      horizon: z.enum(['short', 'long']).optional(),
    })
    .refine((i) => i.teamId !== undefined || i.horizon !== undefined, { message: 'Provide teamId and/or horizon' }),
  run: async (ctx, input, h) => {
    const before = await load(ctx, input.issueId)
    assertVersion(before, h.expectedVersion)
    const teamId = input.teamId === undefined ? before.teamId : input.teamId
    const horizon = input.horizon ?? before.horizon
    if (teamId) await assertTeam(ctx, teamId)
    if (teamId === before.teamId && horizon === before.horizon) return { data: before, entity: { type: 'issue', id: before.id } }
    return save(ctx, before, { teamId, horizon, rank: await nextIssueRank(ctx, teamId, horizon) })
  },
})
