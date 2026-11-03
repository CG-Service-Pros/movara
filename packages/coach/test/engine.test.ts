import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  captureMeetingNotes, execute, getCoachThread, getUsageSummary, listCoachThreads, listTodos, listTeams, meetingSeriesCreate, recordUsage, setNotesExtractor, updateAiSettings, listAudit, type Ctx,
} from '@movara/core'
import { createTestDb, seedTestOrg } from '@movara/core/testing'
import type { DbHandle } from '@movara/db'
import { createNotesExtractor, MockModel, resolveCoachConfirm, runCoachTurn, threadToUi, type CoachContext, type CoachEvent, type CoachModel, type ModelEvent, type ModelRequest } from '../src'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(() => db.$close())
beforeEach(() => { delete process.env.MOVARA_AI_MOCK })

const context: CoachContext = { path: '/acme/priorities' }
const collect = async (g: AsyncGenerator<CoachEvent>) => {
  const events: CoachEvent[] = []
  for await (const e of g) events.push(e)
  return events
}
const of = <T extends CoachEvent['type']>(events: CoachEvent[], t: T) => events.filter((e) => e.type === t) as Extract<CoachEvent, { type: T }>[]
const text = (events: CoachEvent[]) => of(events, 'text').map((e) => e.delta).join('')

async function setup() {
  const o = await seedTestOrg(db)
  return o
}
const run = (ctx: Ctx, message: string, extra: Partial<{ threadId: string; model: CoachModel }> = {}) =>
  collect(runCoachTurn({ ctx, model: extra.model ?? new MockModel() }, { threadId: extra.threadId, message, context }))

describe('Coach engine (mock model)', () => {
  it('runs read tools automatically and answers from the result', async () => {
    const o = await setup()
    const ev = await run(o.ctx, "What's off track? Check priorities")
    expect(of(ev, 'confirm')).toHaveLength(0)
    const chips = of(ev, 'tool_call')
    expect(chips.map((c) => c.status)).toEqual(['running', 'done'])
    expect(chips[1]!.summary).toMatch(/^Looked at \d+ /)
    expect(text(ev)).toMatch(/priorit|looked at/i)
    const done = of(ev, 'done')[0]!
    expect(done.pendingConfirm).toBeUndefined()
    expect(done.usage.inputTokens).toBeGreaterThan(0)
    const t = await getCoachThread(o.ctx, done.threadId)
    expect(t.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(t.title).toMatch(/^What's off track/)
  })

  it('pauses on a write, runs it as the Coach agent on approve, and records the actor', async () => {
    const o = await setup()
    const ev = await run(o.ctx, 'Please add a to-do to call Sam about pricing')
    const confirm = of(ev, 'confirm')[0]!
    expect(confirm.actions).toHaveLength(1)
    expect(confirm.actions[0]).toMatchObject({ tool: 'todo_create', input: { title: 'call Sam about pricing' } })
    expect(confirm.actions[0]!.summary).toMatch(/Create .*call Sam/i)
    const threadId = of(ev, 'thread')[0]!.threadId
    expect(of(ev, 'done')[0]!.pendingConfirm).toBe(true)
    expect(await listTodos(o.ctx, {})).toHaveLength(0) // nothing written before approval

    const after = await collect(resolveCoachConfirm({ ctx: o.ctx, model: new MockModel() }, { threadId, confirmId: confirm.confirmId, approve: true, context }))
    expect(of(after, 'tool_call').map((c) => c.status)).toEqual(['running', 'done'])
    expect(text(after)).toMatch(/done/i)
    const todos = await listTodos(o.ctx, {})
    expect(todos.map((t) => t.title)).toEqual(['call Sam about pricing'])
    const audit = await listAudit(o.ctx, {})
    const ev0 = ((audit.items ?? audit) as any[]).find((a: any) => a.command === 'todo.create')!
    expect(ev0.actor.type).toBe('agent')
    expect(ev0.onBehalfOf ?? ev0.actor.onBehalfOf).toBeTruthy()

    // The UI view: one bubble, confirm approved.
    const ui = threadToUi((await getCoachThread(o.ctx, threadId)).messages)
    expect(ui.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(ui[1]!.confirm).toMatchObject({ status: 'approved' })

    // Approving twice is a no-op error, not a second to-do.
    const again = await collect(resolveCoachConfirm({ ctx: o.ctx, model: new MockModel() }, { threadId, confirmId: confirm.confirmId, approve: true, context }))
    expect(of(again, 'error')[0]!.code).toBe('nothing_to_confirm')
    expect(await listTodos(o.ctx, {})).toHaveLength(1)
  })

  it('tells the model when the person rejects', async () => {
    const o = await setup()
    const ev = await run(o.ctx, 'add a to-do to rewrite the deck')
    const confirm = of(ev, 'confirm')[0]!
    const threadId = of(ev, 'thread')[0]!.threadId
    const after = await collect(resolveCoachConfirm({ ctx: o.ctx, model: new MockModel() }, { threadId, confirmId: confirm.confirmId, approve: false, context }))
    expect(text(after)).toMatch(/won't make that change/i)
    expect(await listTodos(o.ctx, {})).toHaveLength(0)
    const ui = threadToUi((await getCoachThread(o.ctx, threadId)).messages)
    expect(ui.at(-1)!.confirm!.status).toBe('rejected')
  })

  it('closes an unanswered confirmation when the person just keeps typing', async () => {
    const o = await setup()
    const ev = await run(o.ctx, 'add a to-do to ping Lee')
    const threadId = of(ev, 'thread')[0]!.threadId
    const next = await run(o.ctx, 'never mind, how are things?', { threadId })
    expect(of(next, 'error')).toHaveLength(0)
    const msgs = (await getCoachThread(o.ctx, threadId)).messages
    expect(msgs.filter((m) => m.role === 'tool').some((m) => (m.content as any).status === 'rejected')).toBe(true)
    expect(await listTodos(o.ctx, {})).toHaveLength(0)
  })

  it('records usage per model call', async () => {
    const o = await setup()
    await run(o.ctx, 'check my priorities')
    const u = await getUsageSummary(o.ctx)
    expect(u.byFeature.coach!.inputTokens).toBeGreaterThan(0)
    expect(u.byFeature.coach!.outputTokens).toBeGreaterThan(0)
  })

  it('enforces the monthly token limit', async () => {
    const o = await setup()
    await updateAiSettings(o.ctx, { enabled: true, apiKey: 'sk-test-0000000000', monthlyTokenLimit: 100 })
    await recordUsage(o.ctx, { feature: 'coach', model: 'x', inputTokens: 80, outputTokens: 40 })
    const ev = await run(o.ctx, 'hello')
    expect(of(ev, 'error')[0]).toMatchObject({ code: 'limit_reached' })
    expect(of(ev, 'error')[0]!.message).toMatch(/monthly AI limit/)
    expect(await listCoachThreads(o.ctx)).toHaveLength(0)
  })

  it('reports "not configured" without a model override', async () => {
    const o = await setup()
    const ev = await collect(runCoachTurn({ ctx: o.ctx }, { message: 'hi', context }))
    expect(of(ev, 'error')[0]).toMatchObject({ code: 'not_configured' })
    expect(of(ev, 'error')[0]!.message).toMatch(/Settings → Coach/)
  })

  it('falls back to the mock in MOVARA_AI_MOCK=1 even when not configured', async () => {
    process.env.MOVARA_AI_MOCK = '1'
    const o = await setup()
    const ev = await collect(runCoachTurn({ ctx: o.ctx }, { message: 'hello there', context }))
    expect(of(ev, 'error')).toHaveLength(0)
    expect(text(ev)).toMatch(/hello there/)
  })

  it('stops after the maximum number of steps', async () => {
    const o = await setup()
    let calls = 0
    const looping: CoachModel = {
      modelName: 'loop',
      async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
        calls++
        if (req.tools.length) yield { type: 'tool_call', callId: `c${calls}`, name: 'my_week', arguments: '{}' }
        else yield { type: 'text', delta: 'final answer' }
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async json() { return { value: {}, usage: { inputTokens: 0, outputTokens: 0 } } },
    }
    const ev = await collect(runCoachTurn({ ctx: o.ctx, model: looping, maxSteps: 3 }, { message: 'loop', context }))
    expect(calls).toBe(3)
    expect(text(ev)).toBe('final answer')
  })

  it('survives a bad tool call from the model', async () => {
    const o = await setup()
    let n = 0
    const bad: CoachModel = {
      modelName: 'bad',
      async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
        if (n++ === 0) yield { type: 'tool_call', callId: 'x1', name: 'does_not_exist', arguments: '{}' }
        else yield { type: 'text', delta: `saw ${req.input.filter((i) => i.type === 'function_call_output').length} output` }
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async json() { return { value: {}, usage: { inputTokens: 0, outputTokens: 0 } } },
    }
    const ev = await collect(runCoachTurn({ ctx: o.ctx, model: bad }, { message: 'go', context }))
    expect(of(ev, 'tool_call').at(-1)!.status).toBe('error')
    expect(text(ev)).toBe('saw 1 output')
  })

  it('keeps threads private and includes context in the prompt', async () => {
    const o = await setup()
    const other = await o.addPerson('Maya Reyes')
    let seen = ''
    const spy: CoachModel = {
      modelName: 'spy',
      async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
        seen = req.instructions
        yield { type: 'text', delta: 'ok' }
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } }
      },
      async json() { return { value: {}, usage: { inputTokens: 0, outputTokens: 0 } } },
    }
    const ev = await collect(runCoachTurn({ ctx: o.ctx, model: spy }, { message: 'hi', context: { path: '/acme/meetings/1', mode: 'meeting', note: 'Section: Solve issues' } }))
    expect(seen).toContain('MEETING MODE')
    expect(seen).toContain('Section: Solve issues')
    expect(seen).toContain('"Priority"') // terminology
    const threadId = of(ev, 'thread')[0]!.threadId
    const stolen = await collect(runCoachTurn({ ctx: other.ctx, model: spy }, { threadId, message: 'hi', context }))
    expect(of(stolen, 'error')[0]!.code).toBe('not_found')
  })
})

describe('notes extractor', () => {
  it('mock extractor pulls "- [ ]" and "TODO:" lines and records extract usage', async () => {
    process.env.MOVARA_AI_MOCK = '1'
    const o = await setup()
    const team = (await listTeams(o.ctx))[0]!
    const r = await execute(o.ctx, meetingSeriesCreate, { teamId: team.id, name: 'Weekly', firstScheduledAt: new Date(Date.now() - 3600_000), rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00' })
    if (!r.ok) throw new Error('approval')
    setNotesExtractor(createNotesExtractor())
    try {
      const res = await captureMeetingNotes(o.ctx, { meetingId: r.data.firstMeeting!.id, sourceApp: 'manual', notesMarkdown: '# Notes\n- [ ] Send the deck\nTODO: Book the offsite\n- [x] done already\nrandom line' })
      expect(res.itemsSource).toBe('extracted')
      expect(res.items.map((i: any) => i.payload.title).sort()).toEqual(['Book the offsite', 'Send the deck'])
    } finally {
      setNotesExtractor(null)
    }
    expect((await getUsageSummary(o.ctx)).byFeature.extract).toBeTruthy()
  })

  it('structured-output extractor normalizes nulls; unconfigured orgs get null (no extraction)', async () => {
    const o = await setup()
    const input = { notes: 'Maya to send deck', people: [], meeting: { title: 'W', date: '2026-11-02', team: 'T' } }
    const ex = createNotesExtractor({
      model: () => ({
        modelName: 'fake', async *stream() {},
        async json() { return { value: { todos: [{ title: 'Send deck', owner: 'Maya', dueDate: null, description: null }], issues: [], headlines: [], decisions: [] }, usage: { inputTokens: 10, outputTokens: 5 } } },
      }),
    })
    expect(await ex(input, o.ctx)).toBeNull() // no AI configured
    await updateAiSettings(o.ctx, { enabled: true, apiKey: 'sk-test-0000000000' })
    const out = await ex(input, o.ctx)
    expect(out!.todos).toEqual([{ title: 'Send deck', owner: 'Maya' }])
    expect((await getUsageSummary(o.ctx)).byFeature.extract).toMatchObject({ inputTokens: 10, outputTokens: 5 })
  })
})
