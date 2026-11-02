import { desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { agents, chartRevisions, charts, people, seats, teams } from '@motion/db'
import { hasRole, type Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, base, found, newId, scoped, softDelete, touch } from '../helpers'
import { defineCommand } from '../runner'
import { findChart, requireDraftRevision, type ChartRevisionRow, type SeatRow } from './queries'

/** Seat names of the "standard" five-seat starting chart. */
export const STANDARD_SEATS = { root: 'Leader', children: ['Sales & marketing', 'Operations', 'Finance & admin', 'People & culture'] } as const

async function loadRevision(ctx: Ctx, id: string): Promise<ChartRevisionRow> {
  const [r] = await ctx.db.select().from(chartRevisions).where(scoped(chartRevisions, ctx, eq(chartRevisions.id, id))).limit(1)
  return found(r, 'Chart revision')
}
async function loadSeat(ctx: Ctx, id: string): Promise<SeatRow> {
  const [s] = await ctx.db.select().from(seats).where(scoped(seats, ctx, eq(seats.id, id))).limit(1)
  return found(s, 'Seat')
}
async function loadDraftSeat(ctx: Ctx, id: string): Promise<{ seat: SeatRow; revision: ChartRevisionRow }> {
  const seat = await loadSeat(ctx, id)
  const revision = await loadRevision(ctx, seat.chartRevisionId)
  requireDraftRevision(revision)
  return { seat, revision }
}
async function seatsOf(ctx: Ctx, revisionId: string): Promise<SeatRow[]> {
  return ctx.db.select().from(seats).where(scoped(seats, ctx, eq(seats.chartRevisionId, revisionId)))
}
async function mustHavePeople(ctx: Ctx, ids: string[]) {
  if (!ids.length) return
  const rows = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, inArray(people.id, ids)))
  if (rows.length !== new Set(ids).size) throw new MotionError('not_found', 'Person not found')
}
async function mustHaveAgents(ctx: Ctx, ids: string[]) {
  if (!ids.length) return
  const rows = await ctx.db.select({ id: agents.id }).from(agents).where(scoped(agents, ctx, inArray(agents.id, ids)))
  if (rows.length !== new Set(ids).size) throw new MotionError('not_found', 'Agent not found')
}
async function mustHaveTeam(ctx: Ctx, id: string) {
  const [t] = await ctx.db.select({ id: teams.id }).from(teams).where(scoped(teams, ctx, eq(teams.id, id))).limit(1)
  found(t, 'Team')
}
async function ensureChart(ctx: Ctx) {
  return (await findChart(ctx)) ?? (await ctx.db.insert(charts).values({ ...base(ctx) }).returning())[0]!
}
async function currentRevision(ctx: Ctx, chartId: string, status: 'published' | 'draft'): Promise<ChartRevisionRow | null> {
  const [r] = await ctx.db.select().from(chartRevisions).where(scoped(chartRevisions, ctx, eq(chartRevisions.chartId, chartId), eq(chartRevisions.status, status))).orderBy(desc(chartRevisions.number)).limit(1)
  return r ?? null
}

type DraftSource = 'published' | 'blank' | 'template'

/** Create a draft revision. Returns the seat id map (published id -> copied id) for `published`. */
async function createDraftRevision(ctx: Ctx, source: DraftSource): Promise<{ revision: ChartRevisionRow; idMap: Map<string, string> }> {
  const chart = await ensureChart(ctx)
  const [m] = await ctx.db.select({ n: sql<number>`coalesce(max(${chartRevisions.number}), 0)`.mapWith(Number) }).from(chartRevisions).where(eq(chartRevisions.chartId, chart.id))
  const [revision] = await ctx.db.insert(chartRevisions).values({ ...base(ctx), chartId: chart.id, number: (m?.n ?? 0) + 1, status: 'draft' }).returning()
  const idMap = new Map<string, string>()
  const published = source === 'published' ? await currentRevision(ctx, chart.id, 'published') : null
  if (published) {
    const src = await seatsOf(ctx, published.id)
    for (const s of src) idMap.set(s.id, newId())
    if (src.length) {
      await ctx.db.insert(seats).values(
        src.map((s) => ({
          ...base(ctx), id: idMap.get(s.id)!, chartRevisionId: revision!.id, title: s.title, parentSeatId: s.parentSeatId ? (idMap.get(s.parentSeatId) ?? null) : null, sort: s.sort,
          responsibilities: s.responsibilities, personIds: s.personIds, assistingAgentIds: s.assistingAgentIds, teamId: s.teamId, linkedPriorityId: s.linkedPriorityId,
        })),
      )
    }
  } else if (source === 'template') {
    const rootId = newId()
    await ctx.db.insert(seats).values([
      { ...base(ctx), id: rootId, chartRevisionId: revision!.id, title: STANDARD_SEATS.root, sort: 0 },
      ...STANDARD_SEATS.children.map((title, i) => ({ ...base(ctx), chartRevisionId: revision!.id, title, parentSeatId: rootId, sort: i })),
    ])
  }
  return { revision: revision!, idMap }
}

async function publishRevision(ctx: Ctx, rev: ChartRevisionRow): Promise<ChartRevisionRow> {
  requireDraftRevision(rev)
  const all = await seatsOf(ctx, rev.id)
  if (!all.length) throw new MotionError('validation', 'The chart needs at least one seat before publishing')
  if (all.filter((s) => !s.parentSeatId).length !== 1) throw new MotionError('validation', 'The chart needs exactly one top seat')
  await ctx.db.update(chartRevisions).set({ status: 'archived', ...touch(chartRevisions, ctx) }).where(scoped(chartRevisions, ctx, eq(chartRevisions.chartId, rev.chartId), eq(chartRevisions.status, 'published')))
  const [row] = await ctx.db.update(chartRevisions).set({ status: 'published', publishedAt: new Date(), publishedBy: ctx.actor, ...touch(chartRevisions, ctx) }).where(scoped(chartRevisions, ctx, eq(chartRevisions.id, rev.id))).returning()
  return row!
}

// ---- seat operations (shared by the commands and chart.propose_change) -------------

const seatFields = {
  title: z.string().trim().min(1).max(120),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(20),
  personIds: z.array(z.uuid()).max(10),
  assistingAgentIds: z.array(z.uuid()).max(10),
  teamId: z.uuid().nullable(),
  linkedPriorityId: z.uuid().nullable(),
}

async function opAddSeat(ctx: Ctx, revisionId: string, v: { title: string; parentSeatId?: string | null; responsibilities?: string[]; personIds?: string[]; assistingAgentIds?: string[]; teamId?: string | null; linkedPriorityId?: string | null }) {
  const siblings = await seatsOf(ctx, revisionId)
  if (v.parentSeatId && !siblings.some((s) => s.id === v.parentSeatId)) throw new MotionError('not_found', 'Parent seat not found in this revision')
  if (!v.parentSeatId && siblings.some((s) => !s.parentSeatId)) throw new MotionError('validation', 'The chart already has a top seat; give a parentSeatId')
  await mustHavePeople(ctx, v.personIds ?? [])
  await mustHaveAgents(ctx, v.assistingAgentIds ?? [])
  if (v.teamId) await mustHaveTeam(ctx, v.teamId)
  const sort = siblings.filter((s) => (s.parentSeatId ?? null) === (v.parentSeatId ?? null)).reduce((a, s) => Math.max(a, s.sort + 1), 0)
  const [row] = await ctx.db
    .insert(seats)
    .values({
      ...base(ctx), chartRevisionId: revisionId, title: v.title, parentSeatId: v.parentSeatId ?? null, sort, responsibilities: v.responsibilities ?? [],
      personIds: [...new Set(v.personIds ?? [])], assistingAgentIds: [...new Set(v.assistingAgentIds ?? [])], teamId: v.teamId ?? null, linkedPriorityId: v.linkedPriorityId ?? null,
    })
    .returning()
  return row!
}

async function opUpdateSeat(ctx: Ctx, seatId: string, patch: Partial<{ title: string; responsibilities: string[]; teamId: string | null; linkedPriorityId: string | null }>, expectedVersion?: number) {
  const { seat } = await loadDraftSeat(ctx, seatId)
  assertVersion(seat, expectedVersion)
  if (patch.teamId) await mustHaveTeam(ctx, patch.teamId)
  const [after] = await ctx.db.update(seats).set({ ...patch, ...touch(seats, ctx) }).where(scoped(seats, ctx, eq(seats.id, seatId))).returning()
  return { before: seat, after: after! }
}

async function opMoveSeat(ctx: Ctx, seatId: string, parentSeatId: string | null, sort?: number) {
  const { seat, revision } = await loadDraftSeat(ctx, seatId)
  const all = await seatsOf(ctx, revision.id)
  const byId = new Map(all.map((s) => [s.id, s]))
  if (parentSeatId) {
    if (!byId.has(parentSeatId)) throw new MotionError('not_found', 'Parent seat not found in this revision')
    for (let c: string | null = parentSeatId, i = 0; c && i < 100; i++) {
      if (c === seatId) throw new MotionError('validation', 'A seat cannot be moved under itself')
      c = byId.get(c)?.parentSeatId ?? null
    }
  } else if (all.some((s) => !s.parentSeatId && s.id !== seatId)) {
    throw new MotionError('validation', 'The chart already has a top seat')
  }
  const newSort = sort ?? all.filter((s) => (s.parentSeatId ?? null) === parentSeatId && s.id !== seatId).reduce((a, s) => Math.max(a, s.sort + 1), 0)
  const [after] = await ctx.db.update(seats).set({ parentSeatId, sort: newSort, ...touch(seats, ctx) }).where(scoped(seats, ctx, eq(seats.id, seatId))).returning()
  return { before: seat, after: after! }
}

async function opDeleteSeat(ctx: Ctx, seatId: string) {
  const { seat, revision } = await loadDraftSeat(ctx, seatId)
  const kids = (await seatsOf(ctx, revision.id)).filter((s) => s.parentSeatId === seatId)
  if (!seat.parentSeatId && kids.length) throw new MotionError('validation', 'Move or delete the seats under the top seat first')
  if (kids.length) await ctx.db.update(seats).set({ parentSeatId: seat.parentSeatId, ...touch(seats, ctx) }).where(scoped(seats, ctx, eq(seats.parentSeatId, seatId)))
  await ctx.db.update(seats).set(softDelete(seats, ctx)).where(scoped(seats, ctx, eq(seats.id, seatId)))
  return seat
}

async function opAssign(ctx: Ctx, seatId: string, field: 'personIds' | 'assistingAgentIds', ids: string[]) {
  const { seat } = await loadDraftSeat(ctx, seatId)
  if (field === 'personIds') await mustHavePeople(ctx, ids)
  else await mustHaveAgents(ctx, ids)
  const [after] = await ctx.db.update(seats).set({ [field]: [...new Set(ids)], ...touch(seats, ctx) }).where(scoped(seats, ctx, eq(seats.id, seatId))).returning()
  return { before: seat, after: after! }
}

const revSnap = (r: ChartRevisionRow) => ({ number: r.number, status: r.status })
const E = (id: string) => ({ type: 'chart_revision', id })

// ---- drafts -----------------------------------------------------------------------

/**
 * Open a draft: `published` (copy of the live chart, default), `blank`, or `template` (standard
 * five-seat chart). With an existing draft: returns it for `published`, conflict otherwise.
 */
export const chartCreateDraft = defineCommand({
  name: 'chart.create_draft',
  scope: 'propose:chart',
  input: z.object({ from: z.enum(['published', 'blank', 'template']).default('published') }),
  run: async (ctx, input) => {
    const chart = await ensureChart(ctx)
    const existing = await currentRevision(ctx, chart.id, 'draft')
    if (existing) {
      if (input.from !== 'published') throw new MotionError('conflict', 'A draft already exists; discard it first', { draftId: existing.id })
      return { data: { revision: existing, created: false }, entity: E(existing.id), before: null, after: null }
    }
    const { revision } = await createDraftRevision(ctx, input.from)
    return { data: { revision, created: true }, entity: E(revision.id), before: null, after: { ...revSnap(revision), from: input.from } }
  },
})

export const chartDiscardDraft = defineCommand({
  name: 'chart.discard_draft',
  scope: 'propose:chart',
  input: z.object({ revisionId: z.uuid() }),
  run: async (ctx, input) => {
    const rev = await loadRevision(ctx, input.revisionId)
    requireDraftRevision(rev)
    await ctx.db.update(chartRevisions).set(softDelete(chartRevisions, ctx)).where(scoped(chartRevisions, ctx, eq(chartRevisions.id, rev.id)))
    await ctx.db.update(seats).set(softDelete(seats, ctx)).where(scoped(seats, ctx, eq(seats.chartRevisionId, rev.id)))
    return { data: { id: rev.id }, entity: E(rev.id), before: revSnap(rev), after: null }
  },
})

/** Publish a draft (admin role; agents get an approval). Needs exactly one top seat. */
export const chartPublish = defineCommand({
  name: 'chart.publish',
  scope: 'propose:chart',
  minRole: 'admin',
  requiresApprovalForAgents: true,
  input: z.object({ revisionId: z.uuid() }),
  summary: (i) => `Publish accountability chart revision ${i.revisionId}`,
  run: async (ctx, input, h) => {
    const rev = await loadRevision(ctx, input.revisionId)
    assertVersion(rev, h.expectedVersion)
    const row = await publishRevision(ctx, rev)
    return { data: row, entity: E(row.id), before: { status: rev.status }, after: { status: row.status, number: row.number } }
  },
})

// ---- seats ------------------------------------------------------------------------

export const chartAddSeat = defineCommand({
  name: 'chart.add_seat',
  scope: 'propose:chart',
  input: z.object({
    revisionId: z.uuid(),
    title: seatFields.title,
    parentSeatId: z.uuid().nullable().optional(),
    responsibilities: seatFields.responsibilities.default([]),
    personIds: seatFields.personIds.default([]),
    assistingAgentIds: seatFields.assistingAgentIds.default([]),
    teamId: seatFields.teamId.optional(),
    linkedPriorityId: seatFields.linkedPriorityId.optional(),
  }),
  run: async (ctx, input) => {
    requireDraftRevision(await loadRevision(ctx, input.revisionId))
    const { revisionId, ...v } = input
    const row = await opAddSeat(ctx, revisionId, v)
    return { data: row, entity: { type: 'seat', id: row.id }, before: null, after: { title: row.title, parentSeatId: row.parentSeatId, revisionId } }
  },
})

export const chartUpdateSeat = defineCommand({
  name: 'chart.update_seat',
  scope: 'propose:chart',
  input: z.object({
    seatId: z.uuid(),
    title: seatFields.title.optional(),
    responsibilities: seatFields.responsibilities.optional(),
    teamId: seatFields.teamId.optional(),
    linkedPriorityId: seatFields.linkedPriorityId.optional(),
  }),
  run: async (ctx, input, h) => {
    const { seatId, ...patch } = input
    const { before, after } = await opUpdateSeat(ctx, seatId, patch, h.expectedVersion)
    const pick = (s: SeatRow) => ({ title: s.title, responsibilities: s.responsibilities, teamId: s.teamId, linkedPriorityId: s.linkedPriorityId })
    return { data: after, entity: { type: 'seat', id: seatId }, before: pick(before), after: pick(after) }
  },
})

/** Re-parent a seat (cycle-safe) and optionally set its position among the new siblings. */
export const chartMoveSeat = defineCommand({
  name: 'chart.move_seat',
  scope: 'propose:chart',
  input: z.object({ seatId: z.uuid(), parentSeatId: z.uuid().nullable(), sort: z.number().int().min(0).optional() }),
  run: async (ctx, input) => {
    const { before, after } = await opMoveSeat(ctx, input.seatId, input.parentSeatId, input.sort)
    return { data: after, entity: { type: 'seat', id: input.seatId }, before: { parentSeatId: before.parentSeatId, sort: before.sort }, after: { parentSeatId: after.parentSeatId, sort: after.sort } }
  },
})

/** `seatIds` get sort 0..n-1; must be exactly the children of `parentSeatId` (null = top level). */
export const chartReorderSeats = defineCommand({
  name: 'chart.reorder_seats',
  scope: 'propose:chart',
  input: z.object({ revisionId: z.uuid(), parentSeatId: z.uuid().nullable(), seatIds: z.array(z.uuid()).min(1).max(100) }),
  run: async (ctx, input) => {
    requireDraftRevision(await loadRevision(ctx, input.revisionId))
    const kids = (await seatsOf(ctx, input.revisionId)).filter((s) => (s.parentSeatId ?? null) === input.parentSeatId)
    const have = new Set(kids.map((s) => s.id))
    const want = new Set(input.seatIds)
    if (want.size !== input.seatIds.length || have.size !== want.size || ![...want].every((id) => have.has(id))) {
      throw new MotionError('validation', 'seatIds must list every child of the parent exactly once')
    }
    for (const [i, id] of input.seatIds.entries()) await ctx.db.update(seats).set({ sort: i, ...touch(seats, ctx) }).where(scoped(seats, ctx, eq(seats.id, id)))
    return { data: { seatIds: input.seatIds }, entity: E(input.revisionId), before: null, after: { order: input.seatIds } }
  },
})

/** Soft-deletes the seat; its children move up to its parent (the top seat cannot be deleted while it has children). */
export const chartDeleteSeat = defineCommand({
  name: 'chart.delete_seat',
  scope: 'propose:chart',
  input: z.object({ seatId: z.uuid() }),
  run: async (ctx, input) => {
    const seat = await opDeleteSeat(ctx, input.seatId)
    return { data: { id: seat.id }, entity: { type: 'seat', id: seat.id }, before: { title: seat.title }, after: null }
  },
})

/** Replace the people in a seat. */
export const chartAssignPeople = defineCommand({
  name: 'chart.assign_people',
  scope: 'propose:chart',
  input: z.object({ seatId: z.uuid(), personIds: seatFields.personIds }),
  run: async (ctx, input) => {
    const { before, after } = await opAssign(ctx, input.seatId, 'personIds', input.personIds)
    return { data: after, entity: { type: 'seat', id: input.seatId }, before: { personIds: before.personIds }, after: { personIds: after.personIds } }
  },
})

/** Replace the agents assisting a seat. */
export const chartSetAssistingAgents = defineCommand({
  name: 'chart.set_assisting_agents',
  scope: 'propose:chart',
  input: z.object({ seatId: z.uuid(), agentIds: seatFields.assistingAgentIds }),
  run: async (ctx, input) => {
    const { before, after } = await opAssign(ctx, input.seatId, 'assistingAgentIds', input.agentIds)
    return { data: after, entity: { type: 'seat', id: input.seatId }, before: { assistingAgentIds: before.assistingAgentIds }, after: { assistingAgentIds: after.assistingAgentIds } }
  },
})

// ---- propose_change ---------------------------------------------------------------

const seatRef = z.string().min(1).describe('A seat id (draft or published) or an exact seat title')

const chartOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_seat'), title: seatFields.title, parent: seatRef.optional(), responsibilities: seatFields.responsibilities.optional(), personIds: seatFields.personIds.optional(), assistingAgentIds: seatFields.assistingAgentIds.optional(), teamId: seatFields.teamId.optional() }),
  z.object({ op: z.literal('update_seat'), seat: seatRef, title: seatFields.title.optional(), responsibilities: seatFields.responsibilities.optional(), teamId: seatFields.teamId.optional() }),
  z.object({ op: z.literal('move_seat'), seat: seatRef, parent: seatRef.nullable() }),
  z.object({ op: z.literal('delete_seat'), seat: seatRef }),
  z.object({ op: z.literal('assign_people'), seat: seatRef, personIds: seatFields.personIds }),
  z.object({ op: z.literal('set_assisting_agents'), seat: seatRef, agentIds: seatFields.assistingAgentIds }),
])

/**
 * Agents (scope propose:chart) get an approval card. Approving (or a person/admin passing `publish`)
 * applies the ops to a fresh copy of the published chart and publishes it; otherwise the ops go into
 * the open draft (created if needed). Seats are referenced by id (draft or published) or exact title.
 */
export const chartProposeChange = defineCommand({
  name: 'chart.propose_change',
  scope: 'propose:chart',
  requiresApprovalForAgents: true,
  input: z.object({ ops: z.array(chartOp).min(1).max(50), reason: z.string().max(500).optional(), publish: z.boolean().default(false) }),
  summary: (i) => `Accountability chart: ${i.ops.length} change${i.ops.length === 1 ? '' : 's'}${i.reason ? ` (${i.reason})` : ''}`,
  run: async (ctx, input, h) => {
    if (input.publish && !h.approvalId && !hasRole(ctx, 'admin')) throw new MotionError('forbidden', 'Publishing requires the admin role')
    const willPublish = !!h.approvalId || input.publish
    const chart = await ensureChart(ctx)
    const published = await currentRevision(ctx, chart.id, 'published')
    const publishedTitles = new Map((published ? await seatsOf(ctx, published.id) : []).map((s) => [s.id, s.title]))
    const existingDraft = willPublish ? null : await currentRevision(ctx, chart.id, 'draft')
    const { revision, idMap } = existingDraft ? { revision: existingDraft, idMap: new Map<string, string>() } : await createDraftRevision(ctx, 'published')

    const resolve = async (ref: string): Promise<string> => {
      const all = await seatsOf(ctx, revision.id)
      const mapped = idMap.get(ref)
      if (mapped) return mapped
      if (all.some((s) => s.id === ref)) return ref
      const title = publishedTitles.get(ref) ?? ref
      const hits = all.filter((s) => s.title === title)
      if (hits.length === 0) throw new MotionError('not_found', `Seat "${ref}" not found`)
      if (hits.length > 1) throw new MotionError('validation', `Seat title "${ref}" is ambiguous; use an id`)
      return hits[0]!.id
    }

    for (const o of input.ops) {
      switch (o.op) {
        case 'add_seat': await opAddSeat(ctx, revision.id, { ...o, parentSeatId: o.parent ? await resolve(o.parent) : undefined }); break
        case 'update_seat': { const { op: _o, seat, ...patch } = o; await opUpdateSeat(ctx, await resolve(seat), patch); break }
        case 'move_seat': await opMoveSeat(ctx, await resolve(o.seat), o.parent ? await resolve(o.parent) : null); break
        case 'delete_seat': await opDeleteSeat(ctx, await resolve(o.seat)); break
        case 'assign_people': await opAssign(ctx, await resolve(o.seat), 'personIds', o.personIds); break
        case 'set_assisting_agents': await opAssign(ctx, await resolve(o.seat), 'assistingAgentIds', o.agentIds); break
      }
    }
    const final = willPublish ? await publishRevision(ctx, revision) : revision
    return {
      data: { revision: final, published: willPublish },
      entity: E(final.id),
      before: null,
      after: { ...revSnap(final), ops: input.ops.map((o) => o.op), reason: input.reason ?? null, ...(h.approvedBy ? { approvedBy: h.approvedBy } : {}) },
    }
  },
})
