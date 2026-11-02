import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  execute, getLiveState, listTeams, meetingSeriesCreate, metricCreate, orgSetTerminologyPack, scorecardCreate, priorityCreate, issueCreate,
  type Ctx, type Scope,
} from '@motion/core'
import { createTestDb, seedTestOrg } from '@motion/core/testing'
import type { DbHandle } from '@motion/db'
import { createMcpHttpHandler } from '../src/http-handler'
import { createMotionMcpServer } from '../src/server'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(() => db.$close())

const WRITE_ALL: Scope[] = ['read', 'write:todos', 'write:issues', 'write:headlines', 'write:metrics', 'write:priorities', 'write:meetings', 'propose:vision', 'propose:chart']

async function connect(ctx: Ctx, pollMs = 40) {
  const server = await createMotionMcpServer({ db, resolveCtx: () => ctx, pollMs })
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
  return { isError: !!r.isError, body: JSON.parse(r.content[0]!.text) }
}
async function setup(scopes: Scope[] = WRITE_ALL) {
  const o = await seedTestOrg(db)
  const agent = await o.addAgent('Test agent', scopes)
  const [team] = await listTeams(o.ctx)
  return { ...o, agent, team: team!, client: await connect(agent.ctx) }
}

describe('tool list', () => {
  it('is filtered by scope', async () => {
    const ro = await setup(['read'])
    const names = (await ro.client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('org_overview')
    expect(names).toContain('priorities_list')
    expect(names).not.toContain('priority_set_status')
    expect(names).not.toContain('terminology_apply')
    const full = await setup()
    const all = (await full.client.listTools()).tools.map((t) => t.name)
    expect(all).toEqual(expect.arrayContaining(['priority_set_status', 'todo_create', 'vision_propose_change', 'ids_resolve', 'metric_record_values']))
    expect(all).not.toContain('terminology_preview_import') // admin only
    const admin = await setup([...WRITE_ALL, 'admin'])
    expect((await admin.client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['terminology_apply', 'terminology_preview_import']))
  })

  it('renders descriptions from the org terminology', async () => {
    const s = await setup()
    const before = (await s.client.listTools()).tools.find((t) => t.name === 'priority_set_status')!
    expect(before.description).toContain('Priority')
    const pack = JSON.parse(readFileSync(new URL('../../../packs/eos/pack.json', import.meta.url), 'utf8'))
    await execute(s.ctx, orgSetTerminologyPack, { pack })
    const fresh = await connect(s.agent.ctx) // new session picks up the vocabulary
    const after = (await fresh.listTools()).tools.find((t) => t.name === 'priority_set_status')!
    expect(after.name).toBe('priority_set_status')
    expect(after.description).toContain('Rock')
    expect(after.description).toContain('90-day priority')
    const ov = await call(fresh, 'org_overview')
    expect(ov.body.terms.priority.plural).toBe('Rocks')
  })
})

describe('writes', () => {
  it('priority_set_status', async () => {
    const s = await setup()
    const created = await call(s.client, 'priority_create', { title: 'Ship v1', milestones: [{ title: 'Alpha' }] })
    expect(created.body.ok).toBe(true)
    const pid = created.body.entity.id
    const r = await call(s.client, 'priority_set_status', { priorityId: pid, status: 'off_track', requestId: 'r1' })
    expect(r.body).toMatchObject({ ok: true, entity: { status: 'off_track' } })
    expect(r.body.auditId).toBeTruthy()
    const again = await call(s.client, 'priority_set_status', { priorityId: pid, status: 'off_track', requestId: 'r1' })
    expect(again.body.replayed).toBe(true)
    const stale = await call(s.client, 'priority_set_status', { priorityId: pid, status: 'done', expectedVersion: 1 })
    expect(stale.isError).toBe(true)
    expect(stale.body.error.code).toBe('conflict')
    const list = await call(s.client, 'priorities_list')
    expect(list.body.items[0]).toMatchObject({ title: 'Ship v1', status: 'off_track', statusLabel: 'Off track' })
  })

  it('metric_record_values by title', async () => {
    const s = await setup()
    const sc = await execute(s.ctx, scorecardCreate, { teamId: s.team.id })
    if (!sc.ok) throw new Error('approval')
    await execute(s.ctx, metricCreate, { scorecardId: sc.data.id, title: 'Qualified leads', goal: 10 })
    const r = await call(s.client, 'metric_record_values', { values: [{ metricTitle: 'Qualified leads', periodStart: '2026-11-02', value: 12, note: 'hubspot' }] })
    expect(r.body.ok).toBe(true)
    expect(r.body.entity.count).toBe(1)
    const g = await call(s.client, 'scorecard_get', { teamId: s.team.id })
    expect(g.body.metrics[0].title).toBe('Qualified leads')
    const bad = await call(s.client, 'metric_record_values', { scorecardId: sc.data.id, values: [{ metricTitle: 'Nope', periodStart: '2026-11-02', value: 1 }] })
    expect(bad.body.error.code).toBe('not_found')
  })

  it('metric_create takes a description', async () => {
    const s = await setup()
    const sc = await execute(s.ctx, scorecardCreate, { teamId: s.team.id })
    if (!sc.ok) throw new Error('approval')
    const r = await call(s.client, 'metric_create', { scorecardId: sc.data.id, title: 'NPS', goal: 50, description: 'Quarterly survey score' })
    expect(r.body.ok).toBe(true)
    expect(r.body.entity.description).toBe('Quarterly survey score')
    const g = await call(s.client, 'scorecard_get', { teamId: s.team.id })
    expect(g.body.metrics[0].description).toBe('Quarterly survey score')
  })

  it('issues_list and todos_list accept one status or an array', async () => {
    const s = await setup()
    const made = await call(s.client, 'issue_create', { title: 'To solve' })
    await call(s.client, 'issue_create', { title: 'Stays open' })
    await call(s.client, 'issue_solve', { issueId: made.body.entity[0].id })
    const titles = (r: any) => r.body.items.map((i: any) => i.title).sort()
    expect(titles(await call(s.client, 'issues_list'))).toEqual(['Stays open'])
    expect(titles(await call(s.client, 'issues_list', { status: 'solved' }))).toEqual(['To solve'])
    expect(titles(await call(s.client, 'issues_list', { status: ['open', 'solved'] }))).toEqual(['Stays open', 'To solve'])

    const t1 = await call(s.client, 'todo_create', { title: 'Open one' })
    const t2 = await call(s.client, 'todo_create', { title: 'Done one' })
    await call(s.client, 'todo_complete', { todoId: t2.body.entity[0].id })
    expect(t1.body.ok).toBe(true)
    expect(titles(await call(s.client, 'todos_list', { status: 'done' }))).toEqual(['Done one'])
    expect(titles(await call(s.client, 'todos_list', { status: ['open', 'done'] }))).toEqual(['Done one', 'Open one'])
  })

  it('todo_create / issue_create for a team with a live meeting land in that meeting', async () => {
    const s = await setup()
    const series = await execute(s.ctx, meetingSeriesCreate, { teamId: s.team.id, name: 'Weekly', rrule: null, firstScheduledAt: new Date(Date.now() + 3600_000) })
    if (!series.ok) throw new Error('approval')
    const meetingId = series.data.firstMeeting!.id
    expect((await call(s.client, 'meeting_start', { meetingId })).body.ok).toBe(true)
    const todo = await call(s.client, 'todo_create', { title: 'From an agent', teamId: s.team.id })
    const issue = await call(s.client, 'issue_create', { title: 'Agent issue', teamId: s.team.id })
    const live = (await getLiveState(s.ctx, meetingId))!
    expect(live.newTodoIds).toEqual([todo.body.entity[0].id])
    expect(live.ids.addedIssueIds).toEqual([issue.body.entity[0].id])
  })

  it('todo_create fans out to owners', async () => {
    const s = await setup()
    const a = await s.addPerson('Ana'), b = await s.addPerson('Ben')
    const r = await call(s.client, 'todo_create', { title: 'Send deck', ownerIds: [a.personId, b.personId] })
    expect(r.body.ok).toBe(true)
    expect(r.body.entity).toHaveLength(2)
    expect(r.body.entity.map((t: any) => t.ownerId).sort()).toEqual([a.personId, b.personId].sort())
    const list = await call(s.client, 'todos_list', { ownerId: a.personId })
    expect(list.body.items).toHaveLength(1)
  })

  it('vision_propose_change returns needsApproval, then approval_status', async () => {
    const s = await setup()
    const r = await call(s.client, 'vision_propose_change', { section: 'oneYear', op: 'add_goal', text: 'Reach $2M ARR' })
    expect(r.isError).toBe(false)
    expect(r.body).toMatchObject({ ok: false, needsApproval: true })
    const st = await call(s.client, 'approval_status', { approvalId: r.body.approvalId })
    expect(st.body.status).toBe('pending')
    const mine = await call(s.client, 'approvals_list', { status: 'pending' })
    expect(mine.body.items).toHaveLength(1)
  })

  it('maps typed errors (agents cannot rate meetings)', async () => {
    const s = await setup()
    const r = await call(s.client, 'meeting_rate', { meetingId: '0198b2c0-0000-7000-8000-000000000000', score: 8 })
    expect(r.isError).toBe(true)
    expect(['forbidden', 'not_found']).toContain(r.body.error.code)
    const nf = await call(s.client, 'priority_get', { priorityId: '0198b2c0-0000-7000-8000-000000000000' })
    expect(nf.body.error.code).toBe('not_found')
  })
})

describe('meetings', () => {
  it('runs ids_focus_issue -> ids_resolve on a live meeting and pushes resource updates', async () => {
    const s = await setup()
    const series = await execute(s.ctx, meetingSeriesCreate, { teamId: s.team.id, name: 'Weekly', rrule: 'FREQ=WEEKLY;BYDAY=MO' })
    if (!series.ok) throw new Error('approval')
    const meetingId = series.data.firstMeeting!.id
    const issue = await call(s.client, 'issue_create', { title: 'Hiring is slow', teamId: s.team.id })
    const issueId = issue.body.entity[0].id

    const updates: string[] = []
    s.client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { updates.push(n.params.uri) })
    const uri = `motion://meeting/${meetingId}/live`

    const start = await call(s.client, 'meeting_start', { meetingId })
    expect(start.body.ok).toBe(true)
    await s.client.subscribeResource({ uri })
    await new Promise((r) => setTimeout(r, 120))

    const focus = await call(s.client, 'ids_focus_issue', { meetingId, issueIds: [issueId], start: true })
    expect(focus.body.ok).toBe(true)
    expect(focus.body.started.ok).toBe(true)
    const res = await call(s.client, 'ids_resolve', { meetingId, issueId, solved: true, todos: [{ title: 'Post the job', ownerId: s.ctx.actor.id }] })
    expect(res.body.ok).toBe(true)
    expect(res.body.entity.todoIds).toHaveLength(1)
    const solved = await call(s.client, 'issues_list', { status: 'solved' })
    expect(solved.body.items.map((i: any) => i.id)).toContain(issueId)

    await new Promise((r) => setTimeout(r, 200))
    expect(updates).toContain(uri)

    const live = await s.client.readResource({ uri })
    const state = JSON.parse((live.contents[0] as { text: string }).text)
    expect(state.ids.solvedIssueIds).toContain(issueId)
    const end = await call(s.client, 'meeting_end', { meetingId })
    expect(end.body.ok).toBe(true)
  })
})

describe('resources and prompts', () => {
  it('reads resources and lists prompts', async () => {
    const s = await setup()
    await execute(s.ctx, priorityCreate, { title: 'Rock one' })
    await execute(s.ctx, issueCreate, { title: 'x' })
    const ov = JSON.parse(((await s.client.readResource({ uri: 'motion://org/overview' })).contents[0] as { text: string }).text)
    expect(ov.teams.length).toBeGreaterThan(0)
    expect(ov.quarter).toMatch(/^\d{4}-Q[1-4]$/)
    const q = JSON.parse(((await s.client.readResource({ uri: 'motion://quarter/current' })).contents[0] as { text: string }).text)
    expect(q.summary.total).toBe(1)
    const sc = await s.client.readResource({ uri: `motion://team/${s.team.id}/scorecard` }).catch((e) => e)
    expect(sc).toBeDefined()
    const rt = await s.client.listResourceTemplates()
    expect(rt.resourceTemplates.map((t) => t.uriTemplate)).toEqual(expect.arrayContaining(['motion://team/{id}/scorecard', 'motion://meeting/{id}/live']))
    const prompts = (await s.client.listPrompts()).prompts.map((p) => p.name)
    expect(prompts).toEqual(expect.arrayContaining(['weekly-meeting-prep', 'issue-triage', 'quarterly-planning', 'write-a-good-priority', 'metric-from-hubspot']))
    const p = await s.client.getPrompt({ name: 'write-a-good-priority', arguments: { idea: 'grow' } })
    expect(JSON.stringify(p.messages)).toContain('Priority')
  })
})

describe('http handler', () => {
  it('requires a Bearer key, creates a session on initialize', async () => {
    const s = await setup()
    const handle = createMcpHttpHandler({ getDb: async () => db })
    const url = 'http://localhost/mcp'
    const hdr = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    expect((await handle(new Request(url, { method: 'POST', headers: hdr, body: '{}' }))).status).toBe(401)
    expect((await handle(new Request(url, { method: 'POST', headers: { ...hdr, authorization: 'Bearer mk_live_nope' }, body: '{}' }))).status).toBe(401)
    const init = await handle(new Request(url, {
      method: 'POST', headers: { ...hdr, authorization: `Bearer ${s.agent.apiKey}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }),
    }))
    expect(init.status).toBe(200)
    const sid = init.headers.get('mcp-session-id')
    expect(sid).toBeTruthy()
    await init.text()
    const bad = await handle(new Request(url, { method: 'POST', headers: { ...hdr, authorization: `Bearer ${s.agent.apiKey}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) }))
    expect(bad.status).toBe(400)
  })
})
