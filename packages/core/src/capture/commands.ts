import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { captureItems, meetingNotes, orgs, people, requestLog, teams, type CapturePayload } from '@movara/db'
import { actingPersonId, hasRole, hasScope, requireScope, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { base, found, scoped, touch } from '../helpers'
import { headlinePost } from '../headlines/commands'
import { issueCreate } from '../issues/commands'
import { orgCalendar } from '../issues/internal'
import { loadMeeting } from '../meetings/state'
import { defineCommand, execute } from '../runner'
import { todoCreate } from '../todos/commands'
import { getNotesExtractor, type CaptureItemsInput, type ExtractedItems } from '../ai/extractor'
import { resolveOwnerRef, type OwnerCandidate } from './owners'

type ItemRow = typeof captureItems.$inferSelect
export type CaptureKind = ItemRow['kind']
export const CAPTURE_SOURCE_TYPE = 'meeting_notes'

// ------------------------------------------------------------------ org setting

/** `settings.capture.autoAcceptFromAgents` (default false): may agents turn their own proposals into real records? */
export async function agentsMayAutoAccept(ctx: Ctx): Promise<boolean> {
  const [o] = await ctx.db.select({ settings: orgs.settings }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
  return (o?.settings as { capture?: { autoAcceptFromAgents?: boolean } } | undefined)?.capture?.autoAcceptFromAgents === true
}

export async function getCaptureSettings(ctx: Ctx): Promise<{ autoAcceptFromAgents: boolean }> {
  requireScope(ctx, 'read')
  return { autoAcceptFromAgents: await agentsMayAutoAccept(ctx) }
}

export const captureSettingsUpdate = defineCommand({
  name: 'capture.update_settings',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ autoAcceptFromAgents: z.boolean() }),
  summary: (i) => `Set auto-accept of agent meeting captures to ${i.autoAcceptFromAgents}`,
  run: async (ctx, input) => {
    const [o] = await ctx.db.select().from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
    const org = found(o, 'Organization')
    const prev = (org.settings as { capture?: Record<string, unknown> }).capture ?? {}
    await ctx.db.update(orgs).set({ settings: { ...org.settings, capture: { ...prev, autoAcceptFromAgents: input.autoAcceptFromAgents } }, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId))
    return { data: { autoAcceptFromAgents: input.autoAcceptFromAgents }, entity: { type: 'org', id: ctx.orgId }, before: { autoAcceptFromAgents: !!prev.autoAcceptFromAgents }, after: { autoAcceptFromAgents: input.autoAcceptFromAgents } }
  },
})

// ------------------------------------------------------------------ input schemas

const ownerRef = z.string().trim().max(200).nullable().optional()
const optText = z.string().max(10_000).nullable().optional()
/** Lenient: anything that is not a valid YYYY-MM-DD is kept as text in the description instead of failing the whole capture. */
const looseDate = z.string().trim().max(60).nullable().optional()
const title = z.string().trim().min(1).max(300)

export const captureItemsSchema = z.object({
  todos: z.array(z.object({ title, owner: ownerRef, dueDate: looseDate, description: optText })).max(100).optional(),
  issues: z.array(z.object({ title, owner: ownerRef, description: optText, longTerm: z.boolean().optional() })).max(100).optional(),
  headlines: z.array(z.object({ title: z.string().trim().min(1).max(1000), owner: ownerRef, kind: z.enum(['customer', 'employee', 'general']).optional() })).max(100).optional(),
  decisions: z.array(z.object({ text: z.string().trim().min(1).max(1000) })).max(100).optional(),
})

const validDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

type Draft = { kind: CaptureKind; payload: CapturePayload }

function draftsOf(items: CaptureItemsInput, teamId: string, people: OwnerCandidate[], selfId: string | null): Draft[] {
  const owner = (ref?: string | null) => ({ ownerRef: ref?.trim() || null, resolvedOwnerId: resolveOwnerRef(people, ref, selfId) })
  const out: Draft[] = []
  for (const t of items.todos ?? []) {
    const due = t.dueDate?.trim()
    const ok = due && validDate(due)
    const description = [t.description?.trim(), due && !ok ? `Due: ${due}` : ''].filter(Boolean).join('\n\n') || null
    out.push({ kind: 'todo', payload: { title: t.title, ...owner(t.owner), dueDate: ok ? due : null, description, teamId } })
  }
  for (const i of items.issues ?? []) out.push({ kind: 'issue', payload: { title: i.title, ...owner(i.owner), description: i.description ?? null, teamId, longTerm: !!i.longTerm } })
  for (const h of items.headlines ?? []) out.push({ kind: 'headline', payload: { title: h.title, ...owner(h.owner), teamId, headlineKind: h.kind ?? 'general' } })
  for (const d of items.decisions ?? []) out.push({ kind: 'decision', payload: { title: d.text, teamId } })
  return out
}

// ------------------------------------------------------------------ accepting items

export const captureEditSchema = z.object({
  title: z.string().trim().min(1).max(1000).optional(),
  ownerId: z.uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: optText,
  teamId: z.uuid().nullable().optional(),
  longTerm: z.boolean().optional(),
  headlineKind: z.enum(['customer', 'employee', 'general']).optional(),
})
export type CaptureEdit = z.infer<typeof captureEditSchema>

export type AcceptResult = { id: string; status: ItemRow['status']; createdEntityId?: string | null; error?: string }

/** May `ctx` create this kind of record? (Mirrors the scope rules of the underlying commands.) */
function canCreate(ctx: Ctx, kind: CaptureKind, ownerId: string | null): boolean {
  if (kind === 'decision') return true
  if (kind === 'issue') return hasScope(ctx, 'write:issues')
  if (kind === 'headline') return hasScope(ctx, 'write:headlines')
  return hasScope(ctx, 'write:todos') || (hasScope(ctx, 'write:own_todos') && (ownerId ?? actingPersonId(ctx)) === actingPersonId(ctx))
}

async function acceptItem(ctx: Ctx, item: ItemRow, edit: CaptureEdit | undefined): Promise<AcceptResult> {
  const edited = !!edit && Object.keys(edit).length > 0
  const p: CapturePayload = { ...item.payload }
  if (edit) {
    if (edit.title !== undefined) p.title = edit.title
    if (edit.ownerId !== undefined) p.resolvedOwnerId = edit.ownerId
    if (edit.dueDate !== undefined) p.dueDate = edit.dueDate
    if (edit.description !== undefined) p.description = edit.description
    if (edit.teamId !== undefined) p.teamId = edit.teamId
    if (edit.longTerm !== undefined) p.longTerm = edit.longTerm
    if (edit.headlineKind !== undefined) p.headlineKind = edit.headlineKind
  }
  const ownerId = p.resolvedOwnerId ?? null
  if (!canCreate(ctx, item.kind, ownerId)) return { id: item.id, status: item.status, error: 'forbidden_scope: missing the scope needed to create this record' }

  const source = { type: CAPTURE_SOURCE_TYPE, id: item.notesId }
  const ownerIds = ownerId ? [ownerId] : undefined
  let createdEntityId: string | null = null
  try {
    if (item.kind === 'todo') {
      const r = await execute(ctx, todoCreate, { title: p.title, description: p.description ?? null, ownerIds, teamId: p.teamId ?? null, ...(p.dueDate ? { dueDate: p.dueDate } : {}), source })
      if (!r.ok) throw new MovaraError('needs_approval', 'Creating this to-do needs approval')
      createdEntityId = r.data[0]!.id
    } else if (item.kind === 'issue') {
      const r = await execute(ctx, issueCreate, { title: p.title, description: p.description ?? null, ownerIds, teamId: p.teamId ?? null, horizon: p.longTerm ? 'long' : 'short', source })
      if (!r.ok) throw new MovaraError('needs_approval', 'Creating this issue needs approval')
      createdEntityId = r.data[0]!.id
    } else if (item.kind === 'headline') {
      if (!p.teamId) throw new MovaraError('validation', 'A headline needs a team')
      const r = await execute(ctx, headlinePost, { text: p.title, kind: p.headlineKind ?? 'general', ownerIds, teamId: p.teamId })
      if (!r.ok) throw new MovaraError('needs_approval', 'Posting this headline needs approval')
      createdEntityId = r.data[0]!.id
    }
  } catch (e) {
    if (e instanceof MovaraError) return { id: item.id, status: item.status, error: `${e.code}: ${e.message}` }
    throw e
  }
  const status = edited ? 'edited' : 'accepted'
  await ctx.db.update(captureItems).set({ status, payload: p, createdEntityId, decidedBy: ctx.actor, decidedAt: new Date(), ...touch(captureItems, ctx) }).where(scoped(captureItems, ctx, eq(captureItems.id, item.id)))
  return { id: item.id, status, createdEntityId }
}

// ------------------------------------------------------------------ capture.meeting_notes

const sourceUrl = z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v), 'sourceUrl must be an http(s) URL')

export const captureMeetingNotesCmd = defineCommand({
  name: 'capture.meeting_notes',
  scope: 'capture:meetings',
  input: z.object({
    meetingId: z.uuid(),
    sourceApp: z.string().trim().min(1).max(40).default('manual'),
    sourceUrl: sourceUrl.nullable().optional(),
    title: z.string().trim().max(300).nullable().optional(),
    notesMarkdown: z.string().max(400_000).default(''),
    transcript: z.string().max(900_000).nullable().optional(),
    items: captureItemsSchema.optional(),
    autoAccept: z.boolean().default(false),
    /** INTERNAL: set by `captureMeetingNotes` when `items` came from the registered extractor. */
    extracted: z.boolean().optional(),
    extractionError: z.string().max(500).optional(),
  }),
  summary: (i) => `Store meeting notes from ${i.sourceApp}`,
  run: async (ctx, input) => {
    const hasItems = !!input.items && Object.values(input.items).some((a) => a && a.length)
    if (!input.notesMarkdown.trim() && !input.transcript?.trim() && !hasItems) throw new MovaraError('validation', 'Give notesMarkdown, a transcript or items')
    const l = await loadMeeting(ctx, input.meetingId)
    const teamId = l.series.teamId
    const orgPeople = await ctx.db.select({ id: people.id, name: people.name, email: people.email }).from(people).where(scoped(people, ctx))
    const selfId = actingPersonId(ctx) ?? null

    const [notes] = await ctx.db.insert(meetingNotes).values({
      ...base(ctx), meetingId: l.meeting.id, sourceApp: input.sourceApp.toLowerCase(), sourceUrl: input.sourceUrl ?? null,
      title: input.title ?? null, notesMarkdown: input.notesMarkdown, transcript: input.transcript ?? null, capturedByActor: ctx.actor,
    }).returning()

    const drafts = input.items ? draftsOf(input.items, teamId, orgPeople, selfId) : []
    let rows: ItemRow[] = drafts.length
      ? await ctx.db.insert(captureItems).values(drafts.map((d) => ({ ...base(ctx), meetingId: l.meeting.id, notesId: notes!.id, kind: d.kind, payload: d.payload, status: 'proposed' as const }))).returning()
      : []

    // Auto-accept: a person always may; an agent only when the org allows it, and only for kinds its scopes cover.
    let autoAcceptSkipped: string | undefined
    const createdIds = { todoIds: [] as string[], issueIds: [] as string[], headlineIds: [] as string[] }
    if (input.autoAccept && rows.length) {
      if (ctx.actor.type === 'agent' && !(await agentsMayAutoAccept(ctx))) {
        autoAcceptSkipped = 'This organization has not allowed agents to auto-accept captured items: they are waiting for review.'
      } else {
        const done: ItemRow[] = []
        for (const r of rows) {
          if (!canCreate(ctx, r.kind, r.payload.resolvedOwnerId ?? null)) { done.push(r); continue }
          const res = await acceptItem(ctx, r, undefined)
          if (res.error) { done.push(r); continue }
          const kinds = { todo: createdIds.todoIds, issue: createdIds.issueIds, headline: createdIds.headlineIds } as Record<string, string[]>
          if (res.createdEntityId) kinds[r.kind]?.push(res.createdEntityId)
          done.push({ ...r, status: res.status, createdEntityId: res.createdEntityId ?? null })
        }
        rows = done
        if (rows.some((r) => r.status === 'proposed')) autoAcceptSkipped = 'Some items stay proposed: the agent lacks the write scope for them.'
      }
    }

    const { transcript: _t, ...notesOut } = notes!
    const accepted = rows.filter((r) => r.status !== 'proposed').length
    return {
      data: {
        notes: { ...notesOut, hasTranscript: !!notes!.transcript },
        items: rows,
        extracted: !!input.extracted,
        ...(input.extractionError ? { extractionError: input.extractionError } : {}),
        accepted,
        proposed: rows.length - accepted,
        created: createdIds,
        ...(autoAcceptSkipped ? { autoAcceptSkipped } : {}),
      },
      entity: { type: 'meeting_notes', id: notes!.id },
      before: null,
      after: { meetingId: l.meeting.id, sourceApp: notes!.sourceApp, items: rows.length, accepted, extracted: !!input.extracted },
    }
  },
})

export type CaptureNotesInput = Omit<z.input<typeof captureMeetingNotesCmd.input>, 'extracted' | 'extractionError'> & { requestId?: string }
export type CaptureNotesResult = Extract<Awaited<ReturnType<typeof captureMeetingNotesCmd.run>>, { data: unknown }>['data'] & { replayed?: boolean; itemsSource: 'provided' | 'extracted' | 'none' }

/**
 * Store notes (+ optional transcript) on an existing meeting and turn action items into reviewable proposals.
 * Items come from `input.items`; when absent and a NotesExtractor is registered (see `setNotesExtractor`) the notes are
 * extracted first (outside the DB transaction). With neither, only the notes are stored (`extracted: false`).
 * Idempotent per `requestId`. Owner text is resolved to people (email, full name, first name, "me").
 */
export async function captureMeetingNotes(ctx: Ctx, input: CaptureNotesInput) {
  requireScope(ctx, 'capture:meetings')
  if (!hasRole(ctx, 'member')) throw new MovaraError('forbidden', 'Requires role member or higher')
  const { requestId, ...rest } = input
  let items = rest.items
  let extracted = false
  let extractionError: string | undefined
  const extractor = getNotesExtractor()
  if (!items && extractor && (rest.notesMarkdown?.trim() || rest.transcript?.trim())) {
    const l = await loadMeeting(ctx, rest.meetingId) // not_found early, before spending tokens
    const replay = requestId ? (await ctx.db.select({ s: requestLog.status }).from(requestLog).where(and(eq(requestLog.orgId, ctx.orgId), eq(requestLog.requestId, requestId))).limit(1))[0] : undefined
    if (!replay) {
      const [team] = await ctx.db.select({ name: teams.name }).from(teams).where(scoped(teams, ctx, eq(teams.id, l.series.teamId))).limit(1)
      const cal = await orgCalendar(ctx)
      const orgPeople = await ctx.db.select({ id: people.id, name: people.name, email: people.email }).from(people).where(scoped(people, ctx))
      try {
        const out: ExtractedItems | null = await extractor({
          notes: rest.notesMarkdown ?? '', transcript: rest.transcript ?? undefined, people: orgPeople,
          meeting: { title: l.series.name, date: new Intl.DateTimeFormat('en-CA', { timeZone: cal.timezone || 'UTC' }).format(l.meeting.scheduledAt), team: team?.name ?? '' },
        }, ctx)
        if (out) {
          items = captureItemsSchema.parse(out)
          extracted = true
        }
      } catch (e) {
        extractionError = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      }
    }
  }
  const r = await execute(ctx, captureMeetingNotesCmd, { ...rest, items, extracted, extractionError }, { requestId })
  if (!r.ok) throw new MovaraError('needs_approval', 'Unexpected approval')
  const data = r.data as CaptureNotesResult
  return { ...data, itemsSource: (rest.items ? 'provided' : data.extracted ? 'extracted' : 'none') as CaptureNotesResult['itemsSource'], ...(r.replayed ? { replayed: true } : {}) }
}

// ------------------------------------------------------------------ accept / reject

const decideScopes = ['capture:meetings', 'write:todos', 'write:own_todos', 'write:issues', 'write:headlines'] as const

async function assertMayDecide(ctx: Ctx): Promise<void> {
  if (ctx.actor.type === 'agent' && !(await agentsMayAutoAccept(ctx))) {
    throw new MovaraError('forbidden', 'Only people can accept or reject captured items unless an admin allows agents to do so.')
  }
}

async function loadItems(ctx: Ctx, ids: string[]): Promise<ItemRow[]> {
  const unique = [...new Set(ids)]
  const rows = await ctx.db.select().from(captureItems).where(scoped(captureItems, ctx, inArray(captureItems.id, unique))).for('update')
  if (rows.length !== unique.length) throw new MovaraError('not_found', 'Captured item not found')
  return unique.map((id) => rows.find((r) => r.id === id)!)
}

export const captureAcceptItems = defineCommand({
  name: 'capture.accept_items',
  scope: [...decideScopes],
  input: z.object({
    itemIds: z.array(z.uuid()).min(1).max(100),
    /** Per-item changes applied before creating the record (title, owner, due date, ...). Edited items get status `edited`. */
    edits: z.record(z.uuid(), captureEditSchema).optional(),
  }),
  summary: (i) => `Accept ${i.itemIds.length} captured item(s)`,
  run: async (ctx, input) => {
    await assertMayDecide(ctx)
    const items = await loadItems(ctx, input.itemIds)
    const results: AcceptResult[] = []
    for (const it of items) {
      if (it.status !== 'proposed') { results.push({ id: it.id, status: it.status, createdEntityId: it.createdEntityId, error: `already ${it.status}` }); continue }
      results.push(await acceptItem(ctx, it, input.edits?.[it.id]))
    }
    const ok = results.filter((r) => !r.error)
    return {
      data: { results, accepted: ok.length },
      entity: { type: 'meeting_notes', id: items[0]!.notesId },
      before: null,
      after: { itemIds: input.itemIds, accepted: ok.map((r) => r.id), createdEntityIds: ok.map((r) => r.createdEntityId).filter(Boolean) },
    }
  },
})

export const captureRejectItems = defineCommand({
  name: 'capture.reject_items',
  scope: [...decideScopes],
  input: z.object({ itemIds: z.array(z.uuid()).min(1).max(100) }),
  summary: (i) => `Reject ${i.itemIds.length} captured item(s)`,
  run: async (ctx, input) => {
    await assertMayDecide(ctx)
    const items = await loadItems(ctx, input.itemIds)
    const open = items.filter((i) => i.status === 'proposed')
    if (open.length) {
      await ctx.db.update(captureItems).set({ status: 'rejected', decidedBy: ctx.actor, decidedAt: new Date(), ...touch(captureItems, ctx) }).where(scoped(captureItems, ctx, inArray(captureItems.id, open.map((i) => i.id))))
    }
    return {
      data: { rejected: open.map((i) => i.id), skipped: items.filter((i) => i.status !== 'proposed').map((i) => i.id) },
      entity: { type: 'meeting_notes', id: items[0]!.notesId },
      before: null,
      after: { rejected: open.map((i) => i.id) },
    }
  },
})
