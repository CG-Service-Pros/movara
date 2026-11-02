import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { agents, chartRevisions, charts, people, seats } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { found, scoped } from '../helpers'

export type ChartRow = typeof charts.$inferSelect
export type ChartRevisionRow = typeof chartRevisions.$inferSelect
export type SeatRow = typeof seats.$inferSelect
export type SeatNode = SeatRow & {
  people: { id: string; name: string }[]
  assistingAgents: { id: string; name: string }[]
  children: SeatNode[]
}
export type ChartRevisionView = { revision: ChartRevisionRow; seats: SeatNode[]; seatCount: number }
export type ChartView = { chart: ChartRow | null; published: ChartRevisionView | null; draft: ChartRevisionView | null }

export async function findChart(ctx: Ctx): Promise<ChartRow | null> {
  const [c] = await ctx.db.select().from(charts).where(scoped(charts, ctx)).orderBy(asc(charts.createdAt)).limit(1)
  return c ?? null
}

/** Build the seat tree (roots first, ordered by `sort`) with people and agent names. */
export async function seatTree(ctx: Ctx, revisionId: string): Promise<{ roots: SeatNode[]; count: number }> {
  const rows = await ctx.db.select().from(seats).where(scoped(seats, ctx, eq(seats.chartRevisionId, revisionId))).orderBy(asc(seats.sort), asc(seats.createdAt))
  const personIds = [...new Set(rows.flatMap((s) => s.personIds))]
  const agentIds = [...new Set(rows.flatMap((s) => s.assistingAgentIds))]
  const ppl = personIds.length ? await ctx.db.select({ id: people.id, name: people.name }).from(people).where(and(eq(people.orgId, ctx.orgId), inArray(people.id, personIds))) : []
  const ags = agentIds.length ? await ctx.db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.orgId, ctx.orgId), inArray(agents.id, agentIds))) : []
  const pName = new Map(ppl.map((p) => [p.id, p.name]))
  const aName = new Map(ags.map((a) => [a.id, a.name]))
  const nodes = new Map<string, SeatNode>(
    rows.map((s) => [
      s.id,
      {
        ...s,
        people: s.personIds.filter((id) => pName.has(id)).map((id) => ({ id, name: pName.get(id)! })),
        assistingAgents: s.assistingAgentIds.filter((id) => aName.has(id)).map((id) => ({ id, name: aName.get(id)! })),
        children: [],
      },
    ]),
  )
  const roots: SeatNode[] = []
  for (const s of rows) {
    const node = nodes.get(s.id)!
    const parent = s.parentSeatId ? nodes.get(s.parentSeatId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return { roots, count: rows.length }
}

async function view(ctx: Ctx, revision: ChartRevisionRow): Promise<ChartRevisionView> {
  const t = await seatTree(ctx, revision.id)
  return { revision, seats: t.roots, seatCount: t.count }
}

/** The published accountability chart (seat tree) plus the open draft, if any. */
export async function getChart(ctx: Ctx): Promise<ChartView> {
  requireRead(ctx)
  const chart = await findChart(ctx)
  if (!chart) return { chart: null, published: null, draft: null }
  const revs = await ctx.db
    .select()
    .from(chartRevisions)
    .where(scoped(chartRevisions, ctx, eq(chartRevisions.chartId, chart.id), inArray(chartRevisions.status, ['published', 'draft'])))
    .orderBy(desc(chartRevisions.number))
  const p = revs.find((r) => r.status === 'published')
  const d = revs.find((r) => r.status === 'draft')
  return { chart, published: p ? await view(ctx, p) : null, draft: d ? await view(ctx, d) : null }
}

export async function getChartRevision(ctx: Ctx, revisionId: string): Promise<ChartRevisionView> {
  requireRead(ctx)
  const [r] = await ctx.db.select().from(chartRevisions).where(scoped(chartRevisions, ctx, eq(chartRevisions.id, revisionId))).limit(1)
  return view(ctx, found(r, 'Chart revision'))
}

/** Revision history (newest first), without seats. */
export async function listChartRevisions(ctx: Ctx): Promise<ChartRevisionRow[]> {
  requireRead(ctx)
  const chart = await findChart(ctx)
  if (!chart) return []
  return ctx.db.select().from(chartRevisions).where(scoped(chartRevisions, ctx, eq(chartRevisions.chartId, chart.id))).orderBy(desc(chartRevisions.number))
}

export function requireDraftRevision(rev: ChartRevisionRow) {
  if (rev.status !== 'draft') throw new MotionError('conflict', `Revision is ${rev.status}; only drafts can be edited`)
}
