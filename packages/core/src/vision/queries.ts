import { and, desc, eq, inArray } from 'drizzle-orm'
import { approvals, visionPlans, visionRevisions } from '@motion/db'
import { requireRead, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { found, scoped } from '../helpers'
import type { Goal, VisionSections } from './schema'

export type VisionPlanRow = typeof visionPlans.$inferSelect
export type VisionRevisionRow = typeof visionRevisions.$inferSelect

export function sectionsOf(rev: Pick<VisionRevisionRow, 'content'>): VisionSections {
  return ((rev.content as { sections?: VisionSections } | null)?.sections ?? {}) as VisionSections
}

/** Legacy fallback: goals written before `approvedBy` was stored get it from the approval's `decidedBy`. */
async function hydrate(ctx: Ctx, rev: VisionRevisionRow): Promise<VisionRevisionRow> {
  const s = sectionsOf(rev)
  const goals: Goal[] = [...(s.oneYear?.goals ?? []), ...(s.threeYear?.goals ?? [])]
  const ids = [...new Set(goals.flatMap((g) => (g.provenance?.approvalId && !g.provenance.approvedBy ? [g.provenance.approvalId] : [])))]
  if (!ids.length) return rev
  const rows = await ctx.db.select({ id: approvals.id, decidedBy: approvals.decidedBy }).from(approvals).where(and(eq(approvals.orgId, ctx.orgId), inArray(approvals.id, ids)))
  const by = new Map(rows.map((r) => [r.id, r.decidedBy]))
  for (const g of goals) {
    const d = g.provenance?.approvalId ? by.get(g.provenance.approvalId) : null
    if (g.provenance && d) g.provenance.approvedBy = d
  }
  return rev
}

export async function findVisionPlan(ctx: Ctx, teamId?: string | null): Promise<VisionPlanRow | null> {
  const [p] = await ctx.db
    .select()
    .from(visionPlans)
    .where(teamId ? scoped(visionPlans, ctx, eq(visionPlans.scope, 'team'), eq(visionPlans.teamId, teamId)) : scoped(visionPlans, ctx, eq(visionPlans.scope, 'company')))
    .limit(1)
  return p ?? null
}

export type VisionView = { plan: VisionPlanRow | null; published: VisionRevisionRow | null; draft: VisionRevisionRow | null }

/** The current published revision (and the open draft, if any) of the company plan, or of a team's plan. */
export async function getVision(ctx: Ctx, input: { teamId?: string } = {}): Promise<VisionView> {
  requireRead(ctx)
  const plan = await findVisionPlan(ctx, input.teamId)
  if (!plan) return { plan: null, published: null, draft: null }
  const revs = await ctx.db
    .select()
    .from(visionRevisions)
    .where(scoped(visionRevisions, ctx, eq(visionRevisions.planId, plan.id), inArray(visionRevisions.status, ['published', 'draft'])))
    .orderBy(desc(visionRevisions.number))
  const published = revs.find((r) => r.status === 'published') ?? null
  const draft = revs.find((r) => r.status === 'draft') ?? null
  return { plan, published: published ? await hydrate(ctx, published) : null, draft: draft ? await hydrate(ctx, draft) : null }
}

export async function getVisionRevision(ctx: Ctx, revisionId: string): Promise<VisionRevisionRow> {
  requireRead(ctx)
  const [r] = await ctx.db.select().from(visionRevisions).where(scoped(visionRevisions, ctx, eq(visionRevisions.id, revisionId))).limit(1)
  return hydrate(ctx, found(r, 'Vision revision'))
}

/** Revision history (newest first), company plan or a team's plan. */
export async function listVisionRevisions(ctx: Ctx, input: { teamId?: string } = {}): Promise<VisionRevisionRow[]> {
  requireRead(ctx)
  const plan = await findVisionPlan(ctx, input.teamId)
  if (!plan) return []
  return ctx.db.select().from(visionRevisions).where(scoped(visionRevisions, ctx, eq(visionRevisions.planId, plan.id))).orderBy(desc(visionRevisions.number))
}

export function requireDraft(rev: VisionRevisionRow) {
  if (rev.status !== 'draft') throw new MotionError('conflict', `Revision is ${rev.status}; only drafts can be edited`)
}