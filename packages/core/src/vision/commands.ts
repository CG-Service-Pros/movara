import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { issues, teams, visionPlans, visionRevisions } from '@motion/db'
import { hasRole, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, scoped, touch } from '../helpers'
import { defineCommand } from '../runner'
import { findVisionPlan, requireDraft, sectionsOf, type VisionPlanRow, type VisionRevisionRow } from './queries'
import { SECTION_LABELS, VisionSectionsPatch, VisionSectionsSchema, sectionKeySchema, type Goal, type Provenance, type VisionSections } from './schema'

async function loadRevision(ctx: Ctx, id: string): Promise<VisionRevisionRow> {
  const [r] = await ctx.db.select().from(visionRevisions).where(scoped(visionRevisions, ctx, eq(visionRevisions.id, id))).limit(1)
  return found(r, 'Vision revision')
}

async function ensurePlan(ctx: Ctx, teamId?: string | null): Promise<VisionPlanRow> {
  const existing = await findVisionPlan(ctx, teamId)
  if (existing) return existing
  if (teamId) {
    const [t] = await ctx.db.select({ id: teams.id }).from(teams).where(scoped(teams, ctx, eq(teams.id, teamId))).limit(1)
    found(t, 'Team')
  }
  const [p] = await ctx.db.insert(visionPlans).values({ ...base(ctx), scope: teamId ? 'team' : 'company', teamId: teamId ?? null }).returning()
  return p!
}

async function nextNumber(ctx: Ctx, planId: string): Promise<number> {
  // Includes soft-deleted rows: (plan, number) is unique across them.
  const [r] = await ctx.db.select({ n: sql<number>`coalesce(max(${visionRevisions.number}), 0)`.mapWith(Number) }).from(visionRevisions).where(eq(visionRevisions.planId, planId))
  return (r?.n ?? 0) + 1
}

async function currentRevision(ctx: Ctx, planId: string, status: 'published' | 'draft'): Promise<VisionRevisionRow | null> {
  const [r] = await ctx.db.select().from(visionRevisions).where(scoped(visionRevisions, ctx, eq(visionRevisions.planId, planId), eq(visionRevisions.status, status))).orderBy(desc(visionRevisions.number)).limit(1)
  return r ?? null
}

/** New draft revision, copied from the published content (or empty). */
async function createDraftRow(ctx: Ctx, plan: VisionPlanRow): Promise<VisionRevisionRow> {
  const published = await currentRevision(ctx, plan.id, 'published')
  const content = published ? structuredClone(published.content) : { sections: {} }
  const [row] = await ctx.db.insert(visionRevisions).values({ ...base(ctx), planId: plan.id, number: await nextNumber(ctx, plan.id), status: 'draft', content }).returning()
  return row!
}

async function publishRow(ctx: Ctx, rev: VisionRevisionRow): Promise<VisionRevisionRow> {
  requireDraft(rev)
  await ctx.db
    .update(visionRevisions)
    .set({ status: 'archived', ...touch(visionRevisions, ctx) })
    .where(scoped(visionRevisions, ctx, eq(visionRevisions.planId, rev.planId), eq(visionRevisions.status, 'published')))
  const [row] = await ctx.db
    .update(visionRevisions)
    .set({ status: 'published', publishedAt: new Date(), publishedBy: ctx.actor, ...touch(visionRevisions, ctx) })
    .where(scoped(visionRevisions, ctx, eq(visionRevisions.id, rev.id)))
    .returning()
  return row!
}

const revSnap = (r: VisionRevisionRow) => ({ number: r.number, status: r.status })

/** Open a draft (copy of the published revision). Returns the existing draft when there already is one. */
export const visionCreateDraft = defineCommand({
  name: 'vision.create_draft',
  scope: 'propose:vision',
  input: z.object({ teamId: z.uuid().optional() }),
  run: async (ctx, input) => {
    const plan = await ensurePlan(ctx, input.teamId)
    const existing = await currentRevision(ctx, plan.id, 'draft')
    if (existing) return { data: { revision: existing, created: false }, entity: { type: 'vision_revision', id: existing.id }, before: null, after: null }
    const row = await createDraftRow(ctx, plan)
    return { data: { revision: row, created: true }, entity: { type: 'vision_revision', id: row.id }, before: null, after: revSnap(row) }
  },
})

/** Replace whole sections of a draft (each given key is validated and replaces the stored section). */
export const visionUpdateDraft = defineCommand({
  name: 'vision.update_draft',
  scope: 'propose:vision',
  input: z.object({ revisionId: z.uuid(), sections: VisionSectionsPatch }),
  run: async (ctx, input, h) => {
    const before = await loadRevision(ctx, input.revisionId)
    requireDraft(before)
    assertVersion(before, h.expectedVersion)
    const sections = { ...sectionsOf(before), ...input.sections } as VisionSections
    const [after] = await ctx.db.update(visionRevisions).set({ content: { sections }, ...touch(visionRevisions, ctx) }).where(scoped(visionRevisions, ctx, eq(visionRevisions.id, before.id))).returning()
    return { data: after!, entity: { type: 'vision_revision', id: before.id }, before: { sections: Object.keys(input.sections) }, after: { sections: Object.keys(input.sections), number: after!.number } }
  },
})

export const visionDiscardDraft = defineCommand({
  name: 'vision.discard_draft',
  scope: 'propose:vision',
  input: z.object({ revisionId: z.uuid() }),
  run: async (ctx, input) => {
    const rev = await loadRevision(ctx, input.revisionId)
    requireDraft(rev)
    await ctx.db.update(visionRevisions).set({ deletedAt: new Date(), ...touch(visionRevisions, ctx) }).where(scoped(visionRevisions, ctx, eq(visionRevisions.id, rev.id)))
    return { data: { id: rev.id }, entity: { type: 'vision_revision', id: rev.id }, before: revSnap(rev), after: null }
  },
})

/** Publish a draft: admin role; agents get an approval. The previous published revision is archived. */
export const visionPublish = defineCommand({
  name: 'vision.publish',
  scope: 'propose:vision',
  minRole: 'admin',
  requiresApprovalForAgents: true,
  input: z.object({ revisionId: z.uuid() }),
  summary: (i) => `Publish vision revision ${i.revisionId}`,
  run: async (ctx, input, h) => {
    const rev = await loadRevision(ctx, input.revisionId)
    assertVersion(rev, h.expectedVersion)
    const row = await publishRow(ctx, rev)
    return { data: row, entity: { type: 'vision_revision', id: row.id }, before: { status: rev.status }, after: { status: row.status, number: row.number } }
  },
})

// ---- propose_change ---------------------------------------------------------------

const proposeInput = z
  .object({
    teamId: z.uuid().optional(),
    /** Canonical section key, or a legacy/terminology key such as `one_year_plan`. */
    section: sectionKeySchema,
    op: z.enum(['add_goal', 'add_core_value', 'add_long_term_issue', 'set']),
    /** Goal text / core value text. */
    text: z.string().trim().min(1).max(500).optional(),
    /** add_long_term_issue: the issue id. */
    issueId: z.uuid().optional(),
    /** op "set": the full new content of the section. */
    value: z.unknown().optional(),
    /** Where the proposal came from, e.g. "Nov 2 weekly meeting". */
    source: z.string().max(500).optional(),
    /** Publish right after applying (needs the admin role). Approved agent proposals always publish. */
    publish: z.boolean().default(false),
  })
  .superRefine((v, c) => {
    const bad = (message: string) => c.addIssue({ code: 'custom', message })
    if (v.op === 'add_goal') {
      if (!v.text) bad('text is required for add_goal')
      if (v.section !== 'oneYear' && v.section !== 'threeYear') bad('add_goal applies to oneYear or threeYear')
    } else if (v.op === 'add_core_value') {
      if (!v.text) bad('text is required for add_core_value')
      if (v.section !== 'coreValues') bad('add_core_value applies to coreValues')
    } else if (v.op === 'add_long_term_issue') {
      if (!v.issueId) bad('issueId is required for add_long_term_issue')
      if (v.section !== 'longTermIssueIds') bad('add_long_term_issue applies to longTermIssueIds')
    } else if (v.value === undefined) bad('value is required for set')
  })

/**
 * Agents (scope propose:vision) get an approval card; nothing changes until a person approves.
 * Approving (or a person/admin running it directly with `publish`) applies the change to a draft
 * revision and publishes it; otherwise it stays in the draft. Goals carry provenance
 * (proposedBy, approvalId, source, at); `approvedBy` is resolved from the approval when reading.
 */
export const visionProposeChange = defineCommand({
  name: 'vision.propose_change',
  scope: 'propose:vision',
  requiresApprovalForAgents: true,
  input: proposeInput,
  summary: (i) => {
    const what = i.op === 'add_goal' ? `add goal "${i.text}"` : i.op === 'add_core_value' ? `add value "${i.text}"` : i.op === 'add_long_term_issue' ? 'add a long-term issue' : 'replace section'
    return `Vision plan, ${SECTION_LABELS[i.section]}: ${what}`
  },
  run: async (ctx, input, h) => {
    const plan = await ensurePlan(ctx, input.teamId)
    const willPublish = !!h.approvalId || (input.publish && hasRole(ctx, 'admin'))
    if (input.publish && !h.approvalId && !hasRole(ctx, 'admin')) throw new MotionError('forbidden', 'Publishing requires the admin role')
    // Publishing builds on the published content (an unrelated in-progress draft is left alone).
    let rev = willPublish ? await createDraftRow(ctx, plan) : ((await currentRevision(ctx, plan.id, 'draft')) ?? (await createDraftRow(ctx, plan)))
    const sections = structuredClone(sectionsOf(rev)) as Record<string, any>
    const provenance: Provenance = { proposedBy: ctx.actor, approvalId: h.approvalId, source: input.source, at: new Date().toISOString() }
    if (!provenance.approvalId) delete provenance.approvalId
    if (!provenance.source) delete provenance.source

    if (input.op === 'add_goal') {
      const key = input.section as 'oneYear' | 'threeYear'
      const cur = VisionSectionsSchema.shape[key].parse(sections[key] ?? {})
      const goal: Goal = { text: input.text!, provenance }
      sections[key] = { ...cur, goals: [...cur.goals, goal] }
    } else if (input.op === 'add_core_value') {
      sections.coreValues = [...(sections.coreValues ?? []), input.text!]
      VisionSectionsSchema.shape.coreValues.parse(sections.coreValues)
    } else if (input.op === 'add_long_term_issue') {
      const [iss] = await ctx.db.select({ id: issues.id }).from(issues).where(scoped(issues, ctx, eq(issues.id, input.issueId!))).limit(1)
      found(iss, 'Issue')
      sections.longTermIssueIds = [...new Set([...(sections.longTermIssueIds ?? []), input.issueId!])]
    } else {
      const parsed = VisionSectionsSchema.shape[input.section].safeParse(input.value)
      if (!parsed.success) throw new MotionError('validation', `value: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ')}`)
      sections[input.section] = parsed.data
    }

    const [saved] = await ctx.db.update(visionRevisions).set({ content: { sections }, ...touch(visionRevisions, ctx) }).where(scoped(visionRevisions, ctx, eq(visionRevisions.id, rev.id))).returning()
    rev = saved!
    if (willPublish) rev = await publishRow(ctx, rev)
    return {
      data: { revision: rev, published: willPublish },
      entity: { type: 'vision_revision', id: rev.id },
      before: null,
      after: { number: rev.number, status: rev.status, section: input.section, op: input.op, text: input.text ?? null },
    }
  },
})
