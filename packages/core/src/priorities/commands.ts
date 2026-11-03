import { desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { milestones, people, priorities, teams } from '@movara/db'
import { currentQuarter } from '../calendar'
import { actingPersonId, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { assertVersion, base, changedFields, found, scoped, softDelete, touch } from '../helpers'
import { getOrg } from '../org'
import { defineCommand } from '../runner'

const quarterSchema = z.string().regex(/^\d{4}-Q[1-4]$/, 'quarter must look like 2026-Q4')
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
const statusSchema = z.enum(['on_track', 'off_track', 'done', 'not_done', 'dropped'])
const levelSchema = z.enum(['company', 'team', 'individual'])

async function mustHavePerson(ctx: Ctx, id: string) {
  const [p] = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, eq(people.id, id))).limit(1)
  found(p, 'Person')
}
async function mustHaveTeam(ctx: Ctx, id: string) {
  const [t] = await ctx.db.select({ id: teams.id }).from(teams).where(scoped(teams, ctx, eq(teams.id, id))).limit(1)
  found(t, 'Team')
}
async function loadPriority(ctx: Ctx, id: string) {
  const [p] = await ctx.db.select().from(priorities).where(scoped(priorities, ctx, eq(priorities.id, id))).limit(1)
  return found(p, 'Priority')
}
async function nextSort(ctx: Ctx, quarter: string): Promise<number> {
  const [last] = await ctx.db.select({ sort: priorities.sort }).from(priorities).where(scoped(priorities, ctx, eq(priorities.quarter, quarter))).orderBy(desc(priorities.sort)).limit(1)
  return last ? last.sort + 1 : 0
}
/** Parent must exist in the org and must not create a cycle. */
async function checkParent(ctx: Ctx, priorityId: string | null, parentId: string) {
  if (priorityId && parentId === priorityId) throw new MovaraError('validation', 'A priority cannot be its own parent')
  let cursor: string | null = parentId
  for (let i = 0; i < 20 && cursor; i++) {
    const p = await loadPriority(ctx, cursor)
    if (priorityId && p.id === priorityId) throw new MovaraError('validation', 'Parent link would create a cycle')
    cursor = p.parentPriorityId
  }
}

const snap = (p: typeof priorities.$inferSelect) => ({
  title: p.title, description: p.description, ownerId: p.ownerId, teamId: p.teamId, quarter: p.quarter, dueDate: p.dueDate,
  level: p.level, status: p.status, parentPriorityId: p.parentPriorityId,
})

export const priorityCreate = defineCommand({
  name: 'priority.create',
  scope: 'write:priorities',
  input: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    /** Defaults to the acting person (or the agent's owner). */
    ownerId: z.uuid().nullable().optional(),
    teamId: z.uuid().nullable().optional(),
    /** Defaults to the org's current quarter. */
    quarter: quarterSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    level: levelSchema.default('company'),
    status: statusSchema.default('on_track'),
    parentPriorityId: z.uuid().nullable().optional(),
    milestones: z.array(z.object({ title: z.string().trim().min(1).max(200), dueDate: dateSchema.nullable().optional() })).max(50).default([]),
  }),
  summary: (i) => `Create priority "${i.title}"`,
  run: async (ctx, input) => {
    const org = await getOrg(ctx)
    const quarter = input.quarter ?? currentQuarter(org)
    const ownerId = input.ownerId === undefined ? actingPersonId(ctx) : input.ownerId
    if (ownerId) await mustHavePerson(ctx, ownerId)
    if (input.teamId) await mustHaveTeam(ctx, input.teamId)
    if (input.parentPriorityId) await checkParent(ctx, null, input.parentPriorityId)
    const [row] = await ctx.db
      .insert(priorities)
      .values({
        ...base(ctx), title: input.title, description: input.description ?? null, ownerId, teamId: input.teamId ?? null, quarter,
        dueDate: input.dueDate ?? null, level: input.level, status: input.status, parentPriorityId: input.parentPriorityId ?? null,
        sort: await nextSort(ctx, quarter),
      })
      .returning()
    const ms = input.milestones.length
      ? await ctx.db.insert(milestones).values(input.milestones.map((m, i) => ({ ...base(ctx), priorityId: row!.id, title: m.title, dueDate: m.dueDate ?? null, sort: i }))).returning()
      : []
    return { data: { ...row!, milestones: ms }, entity: { type: 'priority', id: row!.id }, before: null, after: { ...snap(row!), milestones: ms.length } }
  },
})

export const priorityUpdate = defineCommand({
  name: 'priority.update',
  scope: 'write:priorities',
  input: z.object({
    priorityId: z.uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    ownerId: z.uuid().nullable().optional(),
    teamId: z.uuid().nullable().optional(),
    quarter: quarterSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    level: levelSchema.optional(),
    parentPriorityId: z.uuid().nullable().optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await loadPriority(ctx, input.priorityId)
    assertVersion(before, h.expectedVersion)
    if (input.ownerId) await mustHavePerson(ctx, input.ownerId)
    if (input.teamId) await mustHaveTeam(ctx, input.teamId)
    if (input.parentPriorityId) await checkParent(ctx, input.priorityId, input.parentPriorityId)
    const { priorityId, ...patch } = input
    const [after] = await ctx.db.update(priorities).set({ ...patch, ...touch(priorities, ctx) }).where(scoped(priorities, ctx, eq(priorities.id, priorityId))).returning()
    return { data: after!, entity: { type: 'priority', id: priorityId }, before: snap(before), after: snap(after!) }
  },
})

export const prioritySetStatus = defineCommand({
  name: 'priority.set_status',
  scope: 'write:priorities',
  input: z.object({ priorityId: z.uuid(), status: statusSchema }),
  summary: (i) => `Set priority ${i.priorityId} to ${i.status}`,
  run: async (ctx, input, h) => {
    const before = await loadPriority(ctx, input.priorityId)
    assertVersion(before, h.expectedVersion)
    const [after] = await ctx.db.update(priorities).set({ status: input.status, ...touch(priorities, ctx) }).where(scoped(priorities, ctx, eq(priorities.id, input.priorityId))).returning()
    return { data: after!, entity: { type: 'priority', id: input.priorityId }, before: { status: before.status }, after: { status: after!.status } }
  },
})

/** Soft delete (recycle bin). Agents need approval. */
export const priorityDelete = defineCommand({
  name: 'priority.delete',
  scope: 'write:priorities',
  requiresApprovalForAgents: true,
  input: z.object({ priorityId: z.uuid() }),
  summary: (i) => `Delete priority ${i.priorityId}`,
  run: async (ctx, input, h) => {
    const before = await loadPriority(ctx, input.priorityId)
    assertVersion(before, h.expectedVersion)
    await ctx.db.update(priorities).set(softDelete(priorities, ctx)).where(scoped(priorities, ctx, eq(priorities.id, input.priorityId)))
    await ctx.db.update(milestones).set(softDelete(milestones, ctx)).where(scoped(milestones, ctx, eq(milestones.priorityId, input.priorityId)))
    await ctx.db.update(priorities).set({ parentPriorityId: null, ...touch(priorities, ctx) }).where(scoped(priorities, ctx, eq(priorities.parentPriorityId, input.priorityId)))
    return { data: { id: input.priorityId }, entity: { type: 'priority', id: input.priorityId }, before: { title: before.title }, after: null }
  },
})

/** Reorder priorities within a quarter: `priorityIds` get sort 0..n-1 in the given order. */
export const priorityReorder = defineCommand({
  name: 'priority.reorder',
  scope: 'write:priorities',
  input: z.object({ quarter: quarterSchema, priorityIds: z.array(z.uuid()).min(1).max(200) }),
  run: async (ctx, input) => {
    const rows = await ctx.db.select({ id: priorities.id }).from(priorities).where(scoped(priorities, ctx, eq(priorities.quarter, input.quarter), inArray(priorities.id, input.priorityIds)))
    if (rows.length !== new Set(input.priorityIds).size) throw new MovaraError('not_found', 'Priority not found in this quarter')
    for (const [i, id] of input.priorityIds.entries()) {
      await ctx.db.update(priorities).set({ sort: i, ...touch(priorities, ctx) }).where(scoped(priorities, ctx, eq(priorities.id, id)))
    }
    return { data: { priorityIds: input.priorityIds }, entity: { type: 'priority', id: input.priorityIds[0]! }, before: null, after: { order: input.priorityIds } }
  },
})

/** Cascade a priority to a team: creates a child priority (level team) linked by parentPriorityId. */
export const priorityCascade = defineCommand({
  name: 'priority.cascade',
  scope: 'write:priorities',
  input: z.object({
    priorityId: z.uuid(),
    teamId: z.uuid(),
    ownerId: z.uuid().nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
  }),
  run: async (ctx, input) => {
    const parent = await loadPriority(ctx, input.priorityId)
    await mustHaveTeam(ctx, input.teamId)
    if (input.ownerId) await mustHavePerson(ctx, input.ownerId)
    const [row] = await ctx.db
      .insert(priorities)
      .values({
        ...base(ctx), title: input.title ?? parent.title, description: parent.description, ownerId: input.ownerId ?? null, teamId: input.teamId,
        quarter: parent.quarter, dueDate: parent.dueDate, level: 'team', status: 'on_track', parentPriorityId: parent.id, sort: await nextSort(ctx, parent.quarter),
      })
      .returning()
    return { data: row!, entity: { type: 'priority', id: row!.id }, before: null, after: { ...snap(row!), cascadedFrom: parent.id } }
  },
})

// ---- Milestones -------------------------------------------------------------------

async function loadMilestone(ctx: Ctx, id: string) {
  const [m] = await ctx.db.select().from(milestones).where(scoped(milestones, ctx, eq(milestones.id, id))).limit(1)
  return found(m, 'Milestone')
}

/** Audit diff for a milestone event: the changed fields plus the milestone's title and priority, so feeds can name it. */
const mDiff = (m: { title: string; priorityId: string }, before: Record<string, unknown>, after: Record<string, unknown>) => ({
  ...changedFields(before, after),
  milestoneTitle: m.title,
  priorityId: m.priorityId,
})

export const milestoneAdd = defineCommand({
  name: 'milestone.add',
  scope: 'write:priorities',
  input: z.object({ priorityId: z.uuid(), title: z.string().trim().min(1).max(200), dueDate: dateSchema.nullable().optional() }),
  run: async (ctx, input) => {
    await loadPriority(ctx, input.priorityId)
    const [last] = await ctx.db.select({ sort: milestones.sort }).from(milestones).where(scoped(milestones, ctx, eq(milestones.priorityId, input.priorityId))).orderBy(desc(milestones.sort)).limit(1)
    const [row] = await ctx.db.insert(milestones).values({ ...base(ctx), priorityId: input.priorityId, title: input.title, dueDate: input.dueDate ?? null, sort: last ? last.sort + 1 : 0 }).returning()
    return { data: row!, entity: { type: 'milestone', id: row!.id }, before: null, after: { priorityId: input.priorityId, title: row!.title, dueDate: row!.dueDate } }
  },
})

export const milestoneUpdate = defineCommand({
  name: 'milestone.update',
  scope: 'write:priorities',
  input: z.object({ milestoneId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), dueDate: dateSchema.nullable().optional() }),
  run: async (ctx, input, h) => {
    const before = await loadMilestone(ctx, input.milestoneId)
    assertVersion(before, h.expectedVersion)
    const { milestoneId, ...patch } = input
    const [after] = await ctx.db.update(milestones).set({ ...patch, ...touch(milestones, ctx) }).where(scoped(milestones, ctx, eq(milestones.id, milestoneId))).returning()
    return { data: after!, entity: { type: 'milestone', id: milestoneId }, diff: mDiff(after!, { title: before.title, dueDate: before.dueDate }, { title: after!.title, dueDate: after!.dueDate }) }
  },
})

/** Mark a milestone done/undone. Without `done` it flips the current state. */
export const milestoneToggle = defineCommand({
  name: 'milestone.toggle',
  scope: 'write:priorities',
  input: z.object({ milestoneId: z.uuid(), done: z.boolean().optional() }),
  run: async (ctx, input, h) => {
    const before = await loadMilestone(ctx, input.milestoneId)
    assertVersion(before, h.expectedVersion)
    const done = input.done ?? !before.doneAt
    const [after] = await ctx.db.update(milestones).set({ doneAt: done ? (before.doneAt ?? new Date()) : null, ...touch(milestones, ctx) }).where(scoped(milestones, ctx, eq(milestones.id, input.milestoneId))).returning()
    return { data: after!, entity: { type: 'milestone', id: input.milestoneId }, diff: mDiff(before, { doneAt: before.doneAt }, { doneAt: after!.doneAt }) }
  },
})

/** `milestoneIds` get sort 0..n-1; must be exactly the priority's milestones. */
export const milestoneReorder = defineCommand({
  name: 'milestone.reorder',
  scope: 'write:priorities',
  input: z.object({ priorityId: z.uuid(), milestoneIds: z.array(z.uuid()).min(1).max(100) }),
  run: async (ctx, input) => {
    await loadPriority(ctx, input.priorityId)
    const rows = await ctx.db.select({ id: milestones.id }).from(milestones).where(scoped(milestones, ctx, eq(milestones.priorityId, input.priorityId)))
    const have = new Set(rows.map((r) => r.id))
    const want = new Set(input.milestoneIds)
    if (want.size !== input.milestoneIds.length || have.size !== want.size || ![...want].every((id) => have.has(id))) {
      throw new MovaraError('validation', 'milestoneIds must list every milestone of the priority exactly once')
    }
    for (const [i, id] of input.milestoneIds.entries()) {
      await ctx.db.update(milestones).set({ sort: i, ...touch(milestones, ctx) }).where(scoped(milestones, ctx, eq(milestones.id, id)))
    }
    return { data: { priorityId: input.priorityId, milestoneIds: input.milestoneIds }, entity: { type: 'priority', id: input.priorityId }, before: null, after: { milestoneOrder: input.milestoneIds } }
  },
})

export const milestoneDelete = defineCommand({
  name: 'milestone.delete',
  scope: 'write:priorities',
  input: z.object({ milestoneId: z.uuid() }),
  run: async (ctx, input, h) => {
    const before = await loadMilestone(ctx, input.milestoneId)
    assertVersion(before, h.expectedVersion)
    await ctx.db.update(milestones).set(softDelete(milestones, ctx)).where(scoped(milestones, ctx, eq(milestones.id, input.milestoneId)))
    return { data: { id: input.milestoneId }, entity: { type: 'milestone', id: input.milestoneId }, diff: { ...mDiff(before, { title: before.title }, {}), after: null } }
  },
})
