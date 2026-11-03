import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { aiUsage, orgAiSettings } from '@movara/db'
import { actingPersonId, requireRead, requireRole, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { newId } from '../helpers'

export type AiFeature = 'coach' | 'extract'

/** Record token usage for one model call. `personId` defaults to the acting person. */
export async function recordUsage(
  ctx: Ctx,
  u: { feature: AiFeature; model: string; inputTokens: number; outputTokens: number; costEstimateUsd?: number | null; personId?: string | null },
): Promise<void> {
  await ctx.db.insert(aiUsage).values({
    id: newId(),
    orgId: ctx.orgId,
    personId: u.personId === undefined ? actingPersonId(ctx) : u.personId,
    feature: u.feature,
    model: u.model,
    inputTokens: Math.max(0, Math.round(u.inputTokens)),
    outputTokens: Math.max(0, Math.round(u.outputTokens)),
    costEstimateUsd: u.costEstimateUsd ?? null,
  })
}

/** [start, end) of a UTC calendar month; `month` is 'YYYY-MM' (default: the current month). */
export function monthBounds(month?: string, now = new Date()): { month: string; start: Date; end: Date } {
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const [y, mo] = m.split('-').map(Number) as [number, number]
  return { month: m, start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) }
}

export type AiUsageSummary = {
  month: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costEstimateUsd: number
  limit: number | null
  remaining: number | null
  overLimit: boolean
  byFeature: Record<string, { inputTokens: number; outputTokens: number; costEstimateUsd: number }>
}

async function sumMonth(ctx: Ctx, month?: string): Promise<AiUsageSummary> {
  const b = monthBounds(month)
  const rows = await ctx.db
    .select({
      feature: aiUsage.feature,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
      cost: sql<number>`coalesce(sum(${aiUsage.costEstimateUsd}), 0)`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, ctx.orgId), gte(aiUsage.at, b.start), lt(aiUsage.at, b.end)))
    .groupBy(aiUsage.feature)
  const [s] = await ctx.db.select({ limit: orgAiSettings.monthlyTokenLimit }).from(orgAiSettings).where(eq(orgAiSettings.orgId, ctx.orgId)).limit(1)
  const byFeature: AiUsageSummary['byFeature'] = {}
  let inputTokens = 0, outputTokens = 0, costEstimateUsd = 0
  for (const r of rows) {
    byFeature[r.feature] = { inputTokens: Number(r.input), outputTokens: Number(r.output), costEstimateUsd: Number(r.cost) }
    inputTokens += Number(r.input); outputTokens += Number(r.output); costEstimateUsd += Number(r.cost)
  }
  const limit = s?.limit ?? null
  const totalTokens = inputTokens + outputTokens
  return { month: b.month, inputTokens, outputTokens, totalTokens, costEstimateUsd, limit, remaining: limit === null ? null : Math.max(0, limit - totalTokens), overLimit: limit !== null && totalTokens >= limit, byFeature }
}

/** Org-wide usage for a month (admin or owner). */
export async function getUsageSummary(ctx: Ctx, opts: { month?: string } = {}): Promise<AiUsageSummary> {
  requireRead(ctx)
  requireRole(ctx, 'admin')
  return sumMonth(ctx, opts.month)
}

/** Throws `forbidden` with a clear message once the org's monthly token limit is reached. Call before every model call. */
export async function assertWithinTokenLimit(ctx: Ctx): Promise<void> {
  const s = await sumMonth(ctx)
  if (s.overLimit) {
    throw new MovaraError('forbidden', `Your organization has used its monthly AI limit (${s.totalTokens.toLocaleString('en-US')} of ${s.limit!.toLocaleString('en-US')} tokens). An admin can raise the limit in Settings, or it resets next month.`, { limit: s.limit, used: s.totalTokens })
  }
}
