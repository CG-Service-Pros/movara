import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@movara/db'
import {
  captureAcceptItems, captureMeetingNotes, captureRejectItems, captureSettingsUpdate, countPendingCaptures, execute, listIssues, listMeetingCaptures, listPendingCaptures, listTeams,
  listTodos, listHeadlines, meetingSeriesCreate, meetingsFind, resolveOwnerRef, setNotesExtractor, todoComplete, todoCreate, ctxForPerson, listAgents, ensureCoachAgent, coachCtxFor,
  agentsRevoke, agentsCreate, SCOPE_PRESETS, presetScopes, type Scope,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => { if (!r.ok) throw new Error('needs approval'); return (r as { data: T }).data }

async function setup(agentScopes: Scope[] = [...SCOPE_PRESETS.notes_integration]) {
  const o = await seedTestOrg(db)
  const team = (await listTeams(o.ctx))[0]!
  const maya = await o.addPerson('Maya Reyes')
  const mark = await o.addPerson('Mark Stone')
  const mara = await o.addPerson('Mara Lopez')
  const s = ok(await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Leadership weekly', attendeeIds: [o.ctx.actor.id, maya.personId], firstScheduledAt: new Date(Date.now() - 2 * 3600_000), rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00' }))
  const agent = await o.addAgent('Granola agent', agentScopes)
  return { ...o, team, maya, mark, mara, meetingId: s.firstMeeting!.id, agent }
}

describe('resolveOwnerRef', () => {
  const people = [
    { id: 'a', name: 'Maya Reyes', email: 'maya@acme.com' },
    { id: 'b', name: 'Mark Stone', email: 'mark@acme.com' },
    { id: 'c', name: 'Mara Lopez', email: 'mara@acme.com' },
    { id: 'd', name: 'Maya Chen', email: 'mchen@acme.com' },
    { id: 'e', name: 'José Álvarez', email: 'jose@acme.com' },
  ]
  it('resolves email, full name, unique first name, me and accents', () => {
    expect(resolveOwnerRef(people, 'MARK@acme.com', 'self')).toBe('b')
    expect(resolveOwnerRef(people, 'Mark Stone <mark@acme.com>', 'self')).toBe('b')
    expect(resolveOwnerRef(people, 'maya reyes', 'self')).toBe('a')
    expect(resolveOwnerRef(people, 'Mark', 'self')).toBe('b')
    expect(resolveOwnerRef(people, 'jose', 'self')).toBe('e')
    expect(resolveOwnerRef(people, 'Lopez', 'self')).toBe('c')
    for (const me of ['me', 'Me', 'myself', 'I', ' me. ']) expect(resolveOwnerRef(people, me, 'self')).toBe('self')
  })
  it('leaves ambiguous or unknown owners unresolved', () => {
    expect(resolveOwnerRef(people, 'Maya', 'self')).toBeNull() // two Mayas
    expect(resolveOwnerRef(people, 'Ma', 'self')).toBeNull()
    expect(resolveOwnerRef(people, 'Zed Nobody', 'self')).toBeNull()
    expect(resolveOwnerRef(people, '', 'self')).toBeNull()
    expect(resolveOwnerRef(people, 'someone@else.com', 'self')).toBeNull()
  })
})

describe('meetingsFind', () => {
  it('finds a past meeting by title, and respects near/team', async () => {
    const s = await setup()
    const byTitle = await meetingsFind(s.ctx, { title: 'weekly leadership sync' })
    expect(byTitle[0]).toMatchObject({ id: s.meetingId, titleMatch: true, status: 'scheduled' })
    expect((await meetingsFind(s.ctx, { near: 'latest' }))[0]!.id).toBe(s.meetingId)
    expect(await meetingsFind(s.ctx, { teamId: '00000000-0000-4000-8000-000000000000' })).toEqual([])
    expect((await meetingsFind(s.agent.ctx, { near: 'latest' })).length).toBeGreaterThan(0) // agent has read
  })
  it('is isolated per org', async () => {
    const a = await setup(), b = await setup()
    const ids = (await meetingsFind(b.ctx, {})).map((m) => m.id)
    expect(ids).not.toContain(a.meetingId)
  })
})

describe('captureMeetingNotes', () => {
  const items = { todos: [{ title: 'Send the proposal', owner: 'me', dueDate: '2026-11-20' }, { title: 'Book venue', owner: 'Mark' }, { title: 'Call vendor', owner: 'Maya' }, { title: 'Unowned thing' }], issues: [{ title: 'Churn is up', owner: 'maya@' }], headlines: [{ title: 'Won Acme', kind: 'customer' as const }], decisions: [{ text: 'We ship on the 30th' }] }

  it('stores notes and proposes items; owners resolve; agent "me" = its owner', async () => {
    const s = await setup()
    const r = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, sourceApp: 'Granola', sourceUrl: 'https://granola.ai/n/1', notesMarkdown: '# Notes\n- x', items, requestId: 'cap-1' })
    expect(r).toMatchObject({ extracted: false, itemsSource: 'provided', accepted: 0, proposed: 7 })
    expect(r.notes).toMatchObject({ sourceApp: 'granola', hasTranscript: false })
    const byTitle = Object.fromEntries(r.items.map((i) => [i.payload.title, i.payload]))
    expect(byTitle['Send the proposal']).toMatchObject({ ownerRef: 'me', resolvedOwnerId: s.ctx.actor.id, dueDate: '2026-11-20', teamId: s.team.id }) // owner of the agent = org owner
    expect(byTitle['Book venue']!.resolvedOwnerId).toBe(s.mark.personId)
    expect(byTitle['Call vendor']!.resolvedOwnerId).toBe(s.maya.personId) // "Maya" unique here? Maya Reyes only
    expect(byTitle['Unowned thing']).toMatchObject({ ownerRef: null, resolvedOwnerId: null })
    expect(r.items.every((i) => i.status === 'proposed')).toBe(true)
    expect(await listTodos(s.ctx, {})).toHaveLength(0) // nothing real was created
    expect(await countPendingCaptures(s.ctx)).toBe(7)
    const pending = await listPendingCaptures(s.ctx)
    expect(pending.count).toBe(7)
    expect(pending.items[0]!.meeting.id).toBe(s.meetingId)
    const cap = await listMeetingCaptures(s.ctx, s.meetingId)
    expect(cap.notes).toHaveLength(1)
    expect(cap.items).toHaveLength(7)
  })

  it('is idempotent per requestId', async () => {
    const s = await setup()
    const input = { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'A' }] }, requestId: 'same' }
    const a = await captureMeetingNotes(s.agent.ctx, input)
    const b = await captureMeetingNotes(s.agent.ctx, input)
    expect(b.replayed).toBe(true)
    expect(b.notes.id).toBe(a.notes.id)
    expect((await listMeetingCaptures(s.ctx, s.meetingId)).notes).toHaveLength(1)
  })

  it('requires the capture:meetings scope and a real meeting of the org', async () => {
    const s = await setup(['read'])
    await expect(captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'x' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const other = await setup()
    await expect(captureMeetingNotes(other.ctx, { meetingId: s.meetingId, notesMarkdown: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(captureMeetingNotes(s.ctx, { meetingId: s.meetingId, notesMarkdown: '' })).rejects.toMatchObject({ code: 'validation' })
    await expect(captureMeetingNotes(s.ctx, { meetingId: s.meetingId, notesMarkdown: 'x', sourceUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'validation' })
  })

  it('turns an unparseable due date into description text instead of failing', async () => {
    const s = await setup()
    const r = await captureMeetingNotes(s.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'T', dueDate: 'next Friday', description: 'ctx' }] } })
    expect(r.items[0]!.payload).toMatchObject({ dueDate: null, description: 'ctx\n\nDue: next Friday' })
  })

  it('autoAccept: a person creates records right away with meeting_notes provenance', async () => {
    const s = await setup()
    const r = await captureMeetingNotes(s.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items, autoAccept: true })
    expect(r).toMatchObject({ accepted: 7, proposed: 0 })
    const todos = await listTodos(s.ctx, {})
    expect(todos.map((t) => t.title).sort()).toEqual(['Book venue', 'Call vendor', 'Send the proposal', 'Unowned thing'])
    const mine = todos.find((t) => t.title === 'Send the proposal')!
    expect(mine).toMatchObject({ ownerId: s.ctx.actor.id, dueDate: '2026-11-20', teamId: s.team.id, source: { type: 'meeting_notes', id: r.notes.id } })
    expect(todos.find((t) => t.title === 'Unowned thing')!.ownerId).toBe(s.ctx.actor.id) // accepter takes unowned items
    expect(todos.find((t) => t.title === 'Unowned thing')!.dueDate).toBeTruthy() // default +7 days
    expect((await listIssues(s.ctx, {}))[0]).toMatchObject({ title: 'Churn is up', source: { type: 'meeting_notes', id: r.notes.id } })
    expect((await listHeadlines(s.ctx, { teamId: s.team.id }) as unknown as { text: string }[]).map((h) => h.text)).toContain('Won Acme')
    expect(r.items.find((i) => i.kind === 'todo')!.createdEntityId).toBeTruthy()
    expect(await countPendingCaptures(s.ctx)).toBe(0)
  })

  it('autoAccept by an agent is gated by the org setting and by the agent scopes', async () => {
    const s = await setup([...SCOPE_PRESETS.team_operator])
    const off = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'A', owner: 'me' }] }, autoAccept: true })
    expect(off).toMatchObject({ accepted: 0, proposed: 1 })
    expect(off.autoAcceptSkipped).toMatch(/not allowed agents/)
    ok(await execute(s.ctx, captureSettingsUpdate, { autoAcceptFromAgents: true }))
    const on = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'B', owner: 'me' }], issues: [{ title: 'I' }] }, autoAccept: true })
    expect(on).toMatchObject({ accepted: 2, proposed: 0 })
    const todo = (await listTodos(s.ctx, {})).find((t) => t.title === 'B')!
    expect(todo.source).toMatchObject({ type: 'meeting_notes' })
    // personal assistant: only own to-dos are auto-accepted, the rest stays proposed
    const pa = await s.addAgent('PA', [...SCOPE_PRESETS.personal_assistant])
    const mixed = await captureMeetingNotes(pa.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'Mine', owner: 'me' }, { title: 'Theirs', owner: 'Mark' }], issues: [{ title: 'Nope' }] }, autoAccept: true })
    expect(mixed).toMatchObject({ accepted: 1, proposed: 2 })
    expect((await listTodos(s.ctx, {})).map((t) => t.title)).toContain('Mine')
    expect((await listTodos(s.ctx, {})).map((t) => t.title)).not.toContain('Theirs')
  })

  it('accept with edits, reject, and agents cannot decide unless allowed', async () => {
    const s = await setup()
    const r = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'n', items: { todos: [{ title: 'Draft deck' }, { title: 'Drop me' }], decisions: [{ text: 'Go' }] } })
    const [t1, t2, d] = r.items
    await expect(execute(s.agent.ctx, captureAcceptItems, { itemIds: [t1!.id] })).rejects.toMatchObject({ code: 'forbidden' })
    const acc = ok(await execute(s.ctx, captureAcceptItems, { itemIds: [t1!.id, d!.id], edits: { [t1!.id]: { title: 'Draft the deck', ownerId: s.maya.personId, dueDate: '2026-12-01' } } }))
    expect(acc.results.map((x) => x.status)).toEqual(['edited', 'accepted'])
    const todo = (await listTodos(s.ctx, {})).find((t) => t.title === 'Draft the deck')!
    expect(todo).toMatchObject({ ownerId: s.maya.personId, dueDate: '2026-12-01', source: { type: 'meeting_notes', id: r.notes.id } })
    expect(ok(await execute(s.ctx, captureAcceptItems, { itemIds: [t1!.id] })).results[0]!.error).toMatch(/already/)
    const rej = ok(await execute(s.ctx, captureRejectItems, { itemIds: [t2!.id] }))
    expect(rej.rejected).toEqual([t2!.id])
    expect((await listMeetingCaptures(s.ctx, s.meetingId)).items.map((i) => i.status).sort()).toEqual(['accepted', 'edited', 'rejected'])
    expect((await listTodos(s.ctx, {})).map((t) => t.title)).not.toContain('Drop me')
    // cross-org
    const other = await setup()
    await expect(execute(other.ctx, captureAcceptItems, { itemIds: [t2!.id] })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('uses the registered extractor when items are absent, and survives extractor errors', async () => {
    const s = await setup()
    const seen: unknown[] = []
    setNotesExtractor(async (input) => {
      seen.push(input)
      return { todos: [{ title: 'Extracted todo', owner: 'Mark' }], issues: [], headlines: [], decisions: [] }
    })
    try {
      const r = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'Mark will do it', requestId: 'ex-1' })
      expect(r).toMatchObject({ extracted: true, itemsSource: 'extracted', proposed: 1 })
      expect(r.items[0]!.payload.resolvedOwnerId).toBe(s.mark.personId)
      expect(seen[0]).toMatchObject({ notes: 'Mark will do it', meeting: { title: 'Leadership weekly', team: s.team.name } })
      expect((seen[0] as { people: unknown[] }).people.length).toBeGreaterThan(3)
      await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'Mark will do it', requestId: 'ex-1' }) // replay: no second extraction
      expect(seen).toHaveLength(1)
      setNotesExtractor(async () => { throw new Error('model down') })
      const bad = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'again' })
      expect(bad).toMatchObject({ extracted: false, extractionError: 'model down', proposed: 0 })
    } finally {
      setNotesExtractor(null)
    }
    const none = await captureMeetingNotes(s.agent.ctx, { meetingId: s.meetingId, notesMarkdown: 'no extractor' })
    expect(none).toMatchObject({ extracted: false, itemsSource: 'none' })
  })
})

describe('write:own_todos', () => {
  it('lets an agent create and complete only to-dos owned by its owner', async () => {
    const o = await seedTestOrg(db)
    const bob = await o.addPerson('Bob Builder')
    const pa = await o.addAgent('PA', [...SCOPE_PRESETS.personal_assistant], bob.personId)
    const mine = ok(await execute(pa.ctx, todoCreate, { title: 'Mine' }))
    expect(mine[0]!.ownerId).toBe(bob.personId)
    ok(await execute(pa.ctx, todoCreate, { title: 'Mine too', ownerIds: [bob.personId] }))
    await expect(execute(pa.ctx, todoCreate, { title: 'Not mine', ownerIds: [o.ctx.actor.id] })).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(execute(pa.ctx, todoCreate, { title: 'Mixed', ownerIds: [bob.personId, o.ctx.actor.id] })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const others = ok(await execute(o.ctx, todoCreate, { title: 'Owner todo' }))
    await expect(execute(pa.ctx, todoComplete, { todoId: others[0]!.id })).rejects.toMatchObject({ code: 'forbidden_scope' })
    const done = ok(await execute(pa.ctx, todoComplete, { todoId: mine[0]!.id }))
    expect(done.status).toBe('done')
    // an agent with only read cannot do either
    const ro = await o.addAgent('RO', ['read'])
    await expect(execute(ro.ctx, todoCreate, { title: 'x' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    // write:todos is unrestricted
    const op = await o.addAgent('Operator', [...SCOPE_PRESETS.team_operator], bob.personId)
    ok(await execute(op.ctx, todoCreate, { title: 'For owner', ownerIds: [o.ctx.actor.id] }))
  })
})

describe('presets and the built-in Coach', () => {
  it('stores the preset on the agent', async () => {
    const o = await seedTestOrg(db)
    const r = ok(await execute(o.ctx, agentsCreate, { name: 'PA', preset: 'personal_assistant' }))
    expect(r.preset).toBe('personal_assistant')
    expect(r.scopes.sort()).toEqual(presetScopes('personal_assistant').sort())
    expect(ok(await execute(o.ctx, agentsCreate, { name: 'Custom', scopes: ['read', 'write:todos'] })).preset).toBeNull()
  })

  it('creates one hidden, irrevocable Coach that acts for the chatting person with their role', async () => {
    const o = await seedTestOrg(db)
    const viewer = await o.addPerson('View Er', 'viewer')
    const member = await o.addPerson('Mem Ber', 'member')
    const a1 = await ensureCoachAgent(o.ctx)
    const a2 = await ensureCoachAgent(member.ctx)
    expect(a2.id).toBe(a1.id)
    expect(a1).toMatchObject({ kind: 'builtin_coach' })
    expect((await listAgents(o.ctx)).map((a) => a.id)).not.toContain(a1.id)
    expect((await listAgents(o.ctx, { includeBuiltin: true })).map((a) => a.id)).toContain(a1.id)
    await expect(execute(o.ctx, agentsRevoke, { agentId: a1.id })).rejects.toMatchObject({ code: 'forbidden' })
    const cc = await coachCtxFor(member.ctx)
    expect(cc).toMatchObject({ actor: { type: 'agent', id: a1.id, onBehalfOf: member.personId }, role: 'member' })
    const t = ok(await execute(cc, todoCreate, { title: 'From Coach' }))
    expect(t[0]!.ownerId).toBe(member.personId)
    expect(t[0]!.createdByActor).toMatchObject({ type: 'agent', id: a1.id, onBehalfOf: member.personId })
    const vc = await coachCtxFor(viewer.ctx)
    await expect(execute(vc, todoCreate, { title: 'No' })).rejects.toMatchObject({ code: 'forbidden' }) // viewer role caps Coach
    await expect(ensureCoachAgent(cc)).rejects.toMatchObject({ code: 'forbidden' }) // only people start Coach
    void ctxForPerson
  })
})
