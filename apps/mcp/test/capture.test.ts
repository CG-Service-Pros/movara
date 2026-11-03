import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { execute, getTerms, listTeams, meetingSeriesCreate, SCOPE_PRESETS, type Ctx, type Scope } from '@movara/core'
import { createTestDb, seedTestOrg } from '@movara/core/testing'
import type { DbHandle } from '@movara/db'
import { getToolRegistry } from '../src/registry'
import { createMovaraMcpServer } from '../src/server'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(() => db.$close())

async function connect(ctx: Ctx) {
  const server = await createMovaraMcpServer({ db, resolveCtx: () => ctx })
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
  return { isError: !!r.isError, body: JSON.parse(r.content[0]!.text) }
}
async function setup(scopes: Scope[]) {
  const o = await seedTestOrg(db)
  const team = (await listTeams(o.ctx))[0]!
  const maya = await o.addPerson('Maya Reyes')
  const r = await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Leadership weekly', firstScheduledAt: new Date(Date.now() - 3600_000), rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00' })
  if (!r.ok) throw new Error('approval')
  const agent = await o.addAgent('Granola', scopes)
  return { ...o, team, maya, meetingId: r.data.firstMeeting!.id, agent, client: await connect(agent.ctx) }
}

describe('tool registry', () => {
  it('is exactly what the MCP server lists, for several scope sets', async () => {
    for (const scopes of [['read'], [...SCOPE_PRESETS.personal_assistant], [...SCOPE_PRESETS.notes_integration], [...SCOPE_PRESETS.team_operator, 'admin']] as Scope[][]) {
      const s = await setup(scopes)
      const reg = getToolRegistry(s.agent.ctx, await getTerms(s.agent.ctx))
      const listed = (await s.client.listTools()).tools
      expect(listed.map((t) => t.name).sort()).toEqual(reg.map((t) => t.name).sort())
      for (const t of reg) {
        const l = listed.find((x) => x.name === t.name)!
        expect(l.description).toBe(t.description)
        expect(l.annotations?.readOnlyHint).toBe(t.annotations.readOnly)
        expect(t.annotations.consequential).toBe(!t.annotations.readOnly)
        expect(Object.keys((l.inputSchema as { properties?: object }).properties ?? {}).sort()).toEqual(Object.keys(t.inputSchema.shape).sort())
      }
    }
  })

  it('exposes the new tools by scope and runs without a transport', async () => {
    const ro = await setup(['read'])
    const names = (await ro.client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['meetings_find', 'capture_pending_list']))
    expect(names).not.toContain('meeting_capture_notes')
    const pa = await setup([...SCOPE_PRESETS.personal_assistant])
    const pn = (await pa.client.listTools()).tools.map((t) => t.name)
    expect(pn).toEqual(expect.arrayContaining(['meeting_capture_notes', 'todo_create', 'todo_complete']))
    expect(pn).not.toContain('issue_create')
    const reg = getToolRegistry(pa.agent.ctx, await getTerms(pa.agent.ctx))
    const found = (await reg.find((t) => t.name === 'meetings_find')!.run({ near: 'latest' })) as { meetings: { id: string }[] }
    expect(found.meetings[0]!.id).toBe(pa.meetingId)
    await expect(reg.find((t) => t.name === 'meetings_find')!.run({ near: 'sometime' })).rejects.toMatchObject({ code: 'validation' })
    expect(reg.find((t) => t.name === 'meeting_capture_notes')!.description).toMatch(/Plaud, Granola/)
  })
})

describe('meeting_capture_notes over MCP', () => {
  it('finds the meeting, pushes notes + items as proposals, lists them as pending, and is idempotent', async () => {
    const s = await setup([...SCOPE_PRESETS.notes_integration])
    const f = await call(s.client, 'meetings_find', { title: 'Leadership weekly sync', near: 'latest' })
    expect(f.body.meetings[0]).toMatchObject({ id: s.meetingId, titleMatch: true })
    const args = {
      meetingId: s.meetingId, sourceApp: 'granola', sourceUrl: 'https://notes.granola.ai/d/abc', notesMarkdown: '## Recap\n- ship it',
      items: { todos: [{ title: 'Send recap', owner: 'me' }, { title: 'Book room', owner: 'maya.reyes' }, { title: 'Call Maya', owner: 'Maya Reyes' }], decisions: [{ text: 'Ship Friday' }] },
      autoAccept: true, requestId: 'granola-abc',
    }
    const r = await call(s.client, 'meeting_capture_notes', args)
    expect(r.isError).toBe(false)
    expect(r.body).toMatchObject({ ok: true, extracted: false, itemsSource: 'provided', accepted: 0, proposed: 4 }) // autoAccept ignored: agents not allowed
    expect(r.body.autoAcceptSkipped).toBeTruthy()
    const todo = r.body.items.find((i: { payload: { title: string } }) => i.payload.title === 'Send recap')
    expect(todo.payload.resolvedOwnerId).toBe(s.ctx.actor.id)
    const again = await call(s.client, 'meeting_capture_notes', args)
    expect(again.body.replayed).toBe(true)
    const pending = await call(s.client, 'capture_pending_list')
    expect(pending.body.count).toBe(4)
    expect(pending.body.items[0].meeting.id).toBe(s.meetingId)
    expect((await s.client.listTools()).tools.map((t) => t.name)).not.toContain('todo_create') // notes integration cannot write directly
  })

  it('personal assistant creates only its own to-dos', async () => {
    const s = await setup([...SCOPE_PRESETS.personal_assistant])
    const ok1 = await call(s.client, 'todo_create', { title: 'Mine' })
    expect(ok1.body).toMatchObject({ ok: true })
    const bad = await call(s.client, 'todo_create', { title: 'Theirs', ownerIds: [s.maya.personId] })
    expect(bad.isError).toBe(true)
    expect(bad.body.error.code).toBe('forbidden_scope')
  })
})
