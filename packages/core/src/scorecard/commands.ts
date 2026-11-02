import { desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { metricValues, metrics, people, scorecards, teams } from '@motion/db'
import { periodStart } from '../calendar'
import type { Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { getOrg } from '../org'
import { defineCommand } from '../runner'
import { calendarFor } from './queries'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
const intervalSchema = z.enum(['day', 'week', 'month', 'quarter'])
const comparisonSchema = z.enum(['gte', 'lte', 'gt', 'lt', 'eq', 'between'])
const unitSchema = z.enum(['number', 'percent', 'currency', 'duration', 'boolean'])

function checkGoal(m: { comparison: string; goal: number | null; goalUpper: number | null }) {
  if (m.goal === null) throw new MotionError('validation', 'goal is required')
  if (m.comparison === 'between') {
    if (m.goalUpper === null) throw new MotionError('validation', 'goalUpper is required for a "between" goal')
    if (m.goalUpper < m.goal) throw new MotionError('validation', 'goalUpper must be >= goal')
  }
}
async function mustHavePeople(ctx: Ctx, ids: string[]) {
  if (!ids.length) return
  const rows = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, inArray(people.id, ids)))
  if (rows.length !== new Set(ids).size) throw new MotionError('not_found', 'Person not found')
}
async function loadScorecard(ctx: Ctx, id: string) {
  const [s] = await ctx.db.select().from(scorecards).where(scoped(scorecards, ctx, eq(scorecards.id, id))).limit(1)
  return found(s, 'Scorecard')
}
async function loadMetric(ctx: Ctx, id: string) {
  const [m] = await ctx.db.select().from(metrics).where(scoped(metrics, ctx, eq(metrics.id, id))).limit(1)
  return found(m, 'Metric')
}

const scSnap = (s: typeof scorecards.$inferSelect) => ({ teamId: s.teamId, interval: s.interval, weekStartDay: s.weekStartDay, periodsShown: s.periodsShown })
const mSnap = (m: typeof metrics.$inferSelect) => ({
  title: m.title, ownerIds: m.ownerIds, comparison: m.comparison, goal: m.goal, goalUpper: m.goalUpper, unit: m.unit, scale: m.scale, decimals: m.decimals, additive: m.additive,
})

// ---- Scorecards -------------------------------------------------------------------

/** One scorecard per team. Settings changes need the admin role. */
export const scorecardCreate = defineCommand({
  name: 'scorecard.create',
  scope: 'write:metrics',
  minRole: 'admin',
  input: z.object({
    teamId: z.uuid(),
    interval: intervalSchema.default('week'),
    /** 0 = Sunday ... 6 = Saturday. Defaults to the org's week start. */
    weekStartDay: z.number().int().min(0).max(6).optional(),
    periodsShown: z.number().int().min(1).max(104).default(13),
  }),
  run: async (ctx, input) => {
    const [team] = await ctx.db.select({ id: teams.id }).from(teams).where(scoped(teams, ctx, eq(teams.id, input.teamId))).limit(1)
    found(team, 'Team')
    const [existing] = await ctx.db.select({ id: scorecards.id }).from(scorecards).where(scoped(scorecards, ctx, eq(scorecards.teamId, input.teamId))).limit(1)
    if (existing) throw new MotionError('conflict', 'This team already has a scorecard', { scorecardId: existing.id })
    const org = await getOrg(ctx)
    const [row] = await ctx.db
      .insert(scorecards)
      .values({ ...base(ctx), teamId: input.teamId, interval: input.interval, weekStartDay: input.weekStartDay ?? org.weekStartDay, periodsShown: input.periodsShown })
      .returning()
    return { data: row!, entity: { type: 'scorecard', id: row!.id }, before: null, after: scSnap(row!) }
  },
})

export const scorecardUpdateSettings = defineCommand({
  name: 'scorecard.update_settings',
  scope: 'write:metrics',
  minRole: 'admin',
  input: z.object({
    scorecardId: z.uuid(),
    interval: intervalSchema.optional(),
    weekStartDay: z.number().int().min(0).max(6).optional(),
    periodsShown: z.number().int().min(1).max(104).optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await loadScorecard(ctx, input.scorecardId)
    assertVersion(before, h.expectedVersion)
    const { scorecardId, ...patch } = input
    const [after] = await ctx.db.update(scorecards).set({ ...patch, ...touch(scorecards, ctx) }).where(scoped(scorecards, ctx, eq(scorecards.id, scorecardId))).returning()
    return { data: after!, entity: { type: 'scorecard', id: scorecardId }, before: scSnap(before), after: scSnap(after!) }
  },
})

// ---- Metrics ----------------------------------------------------------------------

const metricFields = {
  title: z.string().trim().min(1).max(120),
  ownerIds: z.array(z.uuid()).max(10),
  comparison: comparisonSchema,
  goal: z.number(),
  goalUpper: z.number().nullable(),
  unit: unitSchema,
  scale: z.number().positive(),
  decimals: z.number().int().min(0).max(6),
  additive: z.boolean(),
  source: z.record(z.string(), z.unknown()).nullable(),
}

export const metricCreate = defineCommand({
  name: 'metric.create',
  scope: 'write:metrics',
  input: z.object({
    scorecardId: z.uuid(),
    title: metricFields.title,
    ownerIds: metricFields.ownerIds.default([]),
    comparison: metricFields.comparison.default('gte'),
    goal: metricFields.goal,
    goalUpper: metricFields.goalUpper.optional(),
    unit: metricFields.unit.default('number'),
    scale: metricFields.scale.default(1),
    decimals: metricFields.decimals.default(0),
    additive: metricFields.additive.default(false),
    source: metricFields.source.optional(),
  }),
  summary: (i) => `Create metric "${i.title}"`,
  run: async (ctx, input) => {
    await loadScorecard(ctx, input.scorecardId)
    checkGoal({ comparison: input.comparison, goal: input.goal, goalUpper: input.goalUpper ?? null })
    await mustHavePeople(ctx, input.ownerIds)
    const [last] = await ctx.db.select({ sort: metrics.sort }).from(metrics).where(scoped(metrics, ctx, eq(metrics.scorecardId, input.scorecardId))).orderBy(desc(metrics.sort)).limit(1)
    const [row] = await ctx.db
      .insert(metrics)
      .values({ ...base(ctx), ...input, goalUpper: input.goalUpper ?? null, source: input.source ?? null, sort: last ? last.sort + 1 : 0 })
      .returning()
    return { data: row!, entity: { type: 'metric', id: row!.id }, before: null, after: mSnap(row!) }
  },
})

export const metricUpdate = defineCommand({
  name: 'metric.update',
  scope: 'write:metrics',
  input: z.object({
    metricId: z.uuid(),
    title: metricFields.title.optional(),
    ownerIds: metricFields.ownerIds.optional(),
    comparison: metricFields.comparison.optional(),
    goal: metricFields.goal.optional(),
    goalUpper: metricFields.goalUpper.optional(),
    unit: metricFields.unit.optional(),
    scale: metricFields.scale.optional(),
    decimals: metricFields.decimals.optional(),
    additive: metricFields.additive.optional(),
    source: metricFields.source.optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await loadMetric(ctx, input.metricId)
    assertVersion(before, h.expectedVersion)
    const { metricId, ...patch } = input
    checkGoal({ comparison: patch.comparison ?? before.comparison, goal: patch.goal ?? before.goal, goalUpper: patch.goalUpper === undefined ? before.goalUpper : patch.goalUpper })
    if (patch.ownerIds) await mustHavePeople(ctx, patch.ownerIds)
    const [after] = await ctx.db.update(metrics).set({ ...patch, ...touch(metrics, ctx) }).where(scoped(metrics, ctx, eq(metrics.id, metricId))).returning()
    return { data: after!, entity: { type: 'metric', id: metricId }, before: mSnap(before), after: mSnap(after!) }
  },
})

/** `metricIds` get sort 0..n-1; must be exactly the scorecard's metrics. */
export const metricReorder = defineCommand({
  name: 'metric.reorder',
  scope: 'write:metrics',
  input: z.object({ scorecardId: z.uuid(), metricIds: z.array(z.uuid()).min(1).max(200) }),
  run: async (ctx, input) => {
    await loadScorecard(ctx, input.scorecardId)
    const rows = await ctx.db.select({ id: metrics.id }).from(metrics).where(scoped(metrics, ctx, eq(metrics.scorecardId, input.scorecardId)))
    const have = new Set(rows.map((r) => r.id))
    const want = new Set(input.metricIds)
    if (want.size !== input.metricIds.length || have.size !== want.size || ![...want].every((id) => have.has(id))) {
      throw new MotionError('validation', 'metricIds must list every metric of the scorecard exactly once')
    }
    for (const [i, id] of input.metricIds.entries()) {
      await ctx.db.update(metrics).set({ sort: i, ...touch(metrics, ctx) }).where(scoped(metrics, ctx, eq(metrics.id, id)))
    }
    return { data: { scorecardId: input.scorecardId, metricIds: input.metricIds }, entity: { type: 'scorecard', id: input.scorecardId }, before: null, after: { order: input.metricIds } }
  },
})

/** Archive = soft delete; values are kept. Agents need approval. */
export const metricArchive = defineCommand({
  name: 'metric.archive',
  scope: 'write:metrics',
  requiresApprovalForAgents: true,
  input: z.object({ metricId: z.uuid() }),
  summary: (i) => `Archive metric ${i.metricId}`,
  run: async (ctx, input, h) => {
    const before = await loadMetric(ctx, input.metricId)
    assertVersion(before, h.expectedVersion)
    await ctx.db.update(metrics).set(softDelete(metrics, ctx)).where(scoped(metrics, ctx, eq(metrics.id, input.metricId)))
    return { data: { id: input.metricId }, entity: { type: 'metric', id: input.metricId }, before: { title: before.title }, after: null }
  },
})

// ---- Values -----------------------------------------------------------------------

const valueItem = z
  .object({
    metricId: z.uuid().optional(),
    /** Exact title within the scorecard (requires scorecardId or teamId on the command). */
    metricTitle: z.string().min(1).optional(),
    /** Any date inside the period; normalized to the scorecard interval's start. */
    periodStart: dateSchema,
    value: z.number().nullable(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => !!v.metricId !== !!v.metricTitle, { message: 'give exactly one of metricId or metricTitle' })

/** Batch upsert of metric values by (metric, period). Atomic: any bad row rejects the whole batch. */
export const metricRecordValues = defineCommand({
  name: 'metric.record_values',
  scope: 'write:metrics',
  input: z.object({ scorecardId: z.uuid().optional(), teamId: z.uuid().optional(), values: z.array(valueItem).min(1).max(500) }),
  run: async (ctx, input) => {
    const org = await getOrg(ctx)
    let titleScorecardId = input.scorecardId
    if (!titleScorecardId && input.teamId) {
      const [sc] = await ctx.db.select({ id: scorecards.id }).from(scorecards).where(scoped(scorecards, ctx, eq(scorecards.teamId, input.teamId))).limit(1)
      titleScorecardId = found(sc, 'Scorecard').id
    }
    if (titleScorecardId) await loadScorecard(ctx, titleScorecardId)
    if (input.values.some((v) => v.metricTitle) && !titleScorecardId) throw new MotionError('validation', 'scorecardId or teamId is required when using metricTitle')

    const ids = [...new Set(input.values.flatMap((v) => (v.metricId ? [v.metricId] : [])))]
    const byId = new Map<string, typeof metrics.$inferSelect>()
    if (ids.length) for (const m of await ctx.db.select().from(metrics).where(scoped(metrics, ctx, inArray(metrics.id, ids)))) byId.set(m.id, m)
    const byTitle = new Map<string, (typeof metrics.$inferSelect)[]>()
    if (titleScorecardId) {
      for (const m of await ctx.db.select().from(metrics).where(scoped(metrics, ctx, eq(metrics.scorecardId, titleScorecardId)))) {
        byTitle.set(m.title, [...(byTitle.get(m.title) ?? []), m])
      }
    }
    const scs = new Map<string, typeof scorecards.$inferSelect>()
    const scorecardOf = async (id: string) => {
      if (!scs.has(id)) scs.set(id, await loadScorecard(ctx, id))
      return scs.get(id)!
    }
    if (input.scorecardId) for (const m of byId.values()) if (m.scorecardId !== input.scorecardId) throw new MotionError('validation', `Metric ${m.id} is not on this scorecard`)

    const rows = new Map<string, { metric: typeof metrics.$inferSelect; period: string; value: number | null; note: string | undefined }>()
    for (const v of input.values) {
      let metric: typeof metrics.$inferSelect | undefined
      if (v.metricId) metric = byId.get(v.metricId)
      else {
        const hits = byTitle.get(v.metricTitle!) ?? []
        if (hits.length > 1) throw new MotionError('validation', `Metric title "${v.metricTitle}" is ambiguous`)
        metric = hits[0]
      }
      if (!metric) throw new MotionError('not_found', `Metric ${v.metricId ?? `"${v.metricTitle}"`} not found`)
      const sc = await scorecardOf(metric.scorecardId)
      const period = periodStart(v.periodStart, sc.interval, calendarFor(org, sc))
      rows.set(`${metric.id}|${period}`, { metric, period, value: v.value, note: v.note })
    }

    const list = [...rows.values()]
    await ctx.db
      .insert(metricValues)
      .values(list.map((r) => ({ ...base(ctx), metricId: r.metric.id, periodStart: r.period, value: r.value, note: r.note ?? null, enteredByActor: ctx.actor })))
      .onConflictDoUpdate({
        target: [metricValues.metricId, metricValues.periodStart],
        set: {
          value: sql`excluded.value`,
          note: sql`coalesce(excluded.note, ${metricValues.note})`,
          enteredByActor: sql`excluded.entered_by_actor`,
          updatedAt: new Date(),
          updatedByActor: ctx.actor,
          version: sql`${metricValues.version} + 1`,
          deletedAt: null,
        },
      })
    const items = list.map((r) => ({ metricId: r.metric.id, metricTitle: r.metric.title, periodStart: r.period, value: r.value }))
    return {
      data: { count: items.length, items },
      entity: { type: 'metric', id: list[0]!.metric.id },
      before: null,
      after: { count: items.length, values: items.slice(0, 25) },
    }
  },
})
