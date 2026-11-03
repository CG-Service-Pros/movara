import { getToolRegistry, type RegistryTool } from '@movara/mcp'
import {
  appendCoachMessage, assertWithinTokenLimit, coachCtxFor, createCoachThread, getAiClientConfig, getCoachProfile, getCoachThread, getOrg, getPerson, getTerms,
  isMovaraError, recordUsage, type AiClientConfig, type Ctx, type Terms,
} from '@movara/core'
import { describeAction, describeRead } from './describe'
import { unresolvedCalls, toItems, actionOf, type StoredCall, type StoredOutput } from './history'
import { createModel, estimateCostUsd } from './model'
import { isMockMode, MOCK_CONFIG, MockModel } from './mock'
import { buildSystemPrompt } from './prompt'
import { prepareTool, restoreArgs, type PreparedTool } from './schema'
import type { CoachContext, CoachEvent, CoachModel, ToolSpec, Usage } from './types'

export const MAX_STEPS = 8
const MAX_OUTPUT_CHARS = 12_000
/** Tools Coach never offers: people-only or not meaningful for an assistant. */
const EXCLUDED_TOOLS = new Set(['meeting_rate'])

export type CoachDeps = {
  /** The signed-in person's ctx. */
  ctx: Ctx
  /** Override the model (tests). Defaults to the org's configured provider, or the mock in MOVARA_AI_MOCK=1. */
  model?: CoachModel
  maxSteps?: number
  signal?: AbortSignal
}

type Session = {
  person: Ctx
  coach: Ctx
  model: CoachModel
  cfg: AiClientConfig
  terms: Terms
  instructions: string
  tools: Map<string, RegistryTool>
  /** The same tools bound to a ctx marked confirmedByPerson: used only after the person approves a confirm card. */
  confirmedTools: Map<string, RegistryTool>
  prepared: Map<string, PreparedTool>
  specs: ToolSpec[]
  maxSteps: number
  signal?: AbortSignal
}

const errorEvent = (e: unknown, fallbackCode = 'error'): CoachEvent => {
  if (isMovaraError(e)) return { type: 'error', code: e.code === 'forbidden' && /monthly AI limit/.test(e.message) ? 'limit_reached' : e.code, message: e.message }
  return { type: 'error', code: (e as { code?: string })?.code ?? fallbackCode, message: e instanceof Error ? e.message : String(e) }
}

const clip = (s: string) => (s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}... [truncated]` : s)

const ENTITY_TOOLS: Record<string, [string, string]> = { meeting: ['meeting_get', 'meetingId'], priority: ['priority_get', 'priorityId'], issue: ['issue_get', 'issueId'] }

async function openSession(deps: CoachDeps, context: CoachContext): Promise<Session> {
  const person = deps.ctx
  if (person.actor.type !== 'person') throw new Error('Coach is started by a person')
  const coach = await coachCtxFor(person)

  let cfg: AiClientConfig
  let model: CoachModel
  const profile = await getCoachProfile(coach)
  if (deps.model) {
    await assertWithinTokenLimit(coach)
    cfg = { ...MOCK_CONFIG, model: deps.model.modelName, coachName: profile.coachName, coachPersonality: profile.coachPersonality }
    model = deps.model
  } else {
    try {
      cfg = await getAiClientConfig(coach)
    } catch (e) {
      // Not configured: mock mode still works so the product can be demoed and tested without a key.
      if (isMockMode() && isMovaraError(e) && e.code === 'validation') {
        await assertWithinTokenLimit(coach)
        cfg = { ...MOCK_CONFIG, coachName: profile.coachName, coachPersonality: profile.coachPersonality }
      } else if (isMovaraError(e) && e.code === 'validation') {
        throw Object.assign(new Error("Coach isn't set up. An admin can add an API key in Settings → Coach."), { code: 'not_configured' })
      } else throw e
    }
    model = isMockMode() ? new MockModel() : createModel(cfg)
  }

  const [terms, org, me] = await Promise.all([getTerms(coach), getOrg(coach), getPerson(person, person.actor.id)])
  const registry = getToolRegistry(coach, terms).filter((t) => !EXCLUDED_TOOLS.has(t.name))
  const tools = new Map(registry.map((t) => [t.name, t]))
  const confirmedTools = new Map(getToolRegistry({ ...coach, confirmedByPerson: true }, terms).filter((t) => !EXCLUDED_TOOLS.has(t.name)).map((t) => [t.name, t]))
  const prepared = new Map(registry.map((t) => [t.name, prepareTool(t.name, t.description, t.inputSchema, ['requestId', 'expectedVersion'])]))

  let entityJson: string | undefined
  const target = context.mode === 'vision' ? ['vision_get', null] : context.entityType ? ENTITY_TOOLS[context.entityType] : undefined
  if (target && (target[1] === null || context.entityId)) {
    const tool = tools.get(target[0]!)
    if (tool) {
      try {
        entityJson = clip(JSON.stringify(await tool.run(target[1] ? { [target[1]]: context.entityId } : {}))).slice(0, 6000)
      } catch {
        /* the model can still call the tool itself */
      }
    }
  }

  const instructions = buildSystemPrompt({
    coachName: cfg.coachName, personality: cfg.coachPersonality, orgName: org.name, personName: me.name, role: person.role,
    today: new Date().toISOString().slice(0, 10), terms, context, entityJson,
  })
  return { person, coach, model, cfg, terms, instructions, tools, confirmedTools, prepared, specs: [...prepared.values()].map((p) => p.spec), maxSteps: deps.maxSteps ?? MAX_STEPS, signal: deps.signal }
}

function parseArguments(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? { ok: true, value: v } : { ok: false, error: 'Arguments must be a JSON object' }
  } catch {
    return { ok: false, error: 'Arguments were not valid JSON' }
  }
}

async function runTool(s: Session, call: Pick<StoredCall, 'id' | 'name' | 'arguments'>, write: boolean): Promise<{ output: StoredOutput; ok: boolean }> {
  // Writes only run here after the person approved them on a confirm card.
  const tool = (write ? s.confirmedTools : s.tools).get(call.name)
  const args = parseArguments(call.arguments)
  const fail = (message: string, code = 'validation') => ({
    ok: false, output: { callId: call.id, name: call.name, output: JSON.stringify({ error: { code, message } }), status: 'error' as const, summary: `${describeRead(call.name, {}, null, s.terms)} (failed)` },
  })
  if (!tool) return fail(`Unknown tool ${call.name}`, 'not_found')
  if (!args.ok) return fail(args.error)
  const clean = restoreArgs(s.prepared.get(call.name)!.original, args.value) as Record<string, unknown>
  try {
    const result = await tool.run(write ? { ...clean, requestId: `coach-${call.id}`.slice(0, 200) } : clean)
    const summary = write ? describeAction(call.name, clean, s.terms) : describeRead(call.name, clean, result, s.terms)
    return { ok: true, output: { callId: call.id, name: call.name, output: clip(JSON.stringify(result)), status: 'ok', summary } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const code = isMovaraError(e) ? e.code : 'internal'
    return { ok: false, output: { callId: call.id, name: call.name, output: JSON.stringify({ error: { code, message } }), status: 'error', summary: `${write ? describeAction(call.name, clean, s.terms) : describeRead(call.name, clean, null, s.terms)} (failed)` } }
  }
}

/** The agent loop: model step -> read tools run automatically -> writes pause for confirmation. */
async function* loop(s: Session, threadId: string): AsyncGenerator<CoachEvent> {
  const total: Usage = { inputTokens: 0, outputTokens: 0 }
  for (let step = 1; step <= s.maxSteps; step++) {
    if (s.signal?.aborted) break
    if (step > 1) await assertWithinTokenLimit(s.coach)
    const thread = await getCoachThread(s.person, threadId)
    const input = toItems(thread.messages)
    const lastStep = step === s.maxSteps

    let text = ''
    const raw: { callId: string; name: string; arguments: string }[] = []
    let usage: Usage = { inputTokens: 0, outputTokens: 0 }
    for await (const ev of s.model.stream({ instructions: s.instructions, input, tools: lastStep ? [] : s.specs, signal: s.signal })) {
      if (ev.type === 'text') {
        text += ev.delta
        yield { type: 'text', delta: ev.delta }
      } else if (ev.type === 'tool_call') raw.push(ev)
      else usage = ev.usage
    }
    total.inputTokens += usage.inputTokens
    total.outputTokens += usage.outputTokens
    await recordUsage(s.person, { feature: 'coach', model: s.model.modelName, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costEstimateUsd: estimateCostUsd(s.model.modelName, usage) })

    const stored: StoredCall[] = raw.map((c) => {
      const tool = s.tools.get(c.name)
      const kind: StoredCall['kind'] = !tool ? 'unknown' : tool.annotations.readOnly ? 'read' : 'write'
      const args = parseArguments(c.arguments)
      const summary = kind === 'write' ? describeAction(c.name, args.ok ? args.value : {}, s.terms) : describeRead(c.name, args.ok ? args.value : {}, null, s.terms)
      return { id: c.callId, name: c.name, arguments: c.arguments, kind, summary }
    })
    const msg = await appendCoachMessage(s.person, threadId, { role: 'assistant', content: { text }, toolCalls: stored.length ? stored : null, usage: { ...usage, model: s.model.modelName } })
    if (!stored.length) break

    for (const c of stored.filter((c) => c.kind !== 'write')) {
      yield { type: 'tool_call', id: c.id, name: c.name, summary: c.summary, status: 'running' }
      const r = await runTool(s, c, false)
      await appendCoachMessage(s.person, threadId, { role: 'tool', content: r.output })
      yield { type: 'tool_call', id: c.id, name: c.name, summary: r.output.summary, status: r.ok ? 'done' : 'error' }
    }
    const writes = stored.filter((c) => c.kind === 'write')
    if (writes.length) {
      yield { type: 'confirm', confirmId: msg.id, actions: writes.map(actionOf) }
      yield { type: 'done', threadId, usage: total, pendingConfirm: true }
      return
    }
  }
  yield { type: 'done', threadId, usage: total }
}

/** Close tool calls nobody answered (the person typed on instead of confirming, or a step failed midway). */
async function closeDangling(s: Session, threadId: string): Promise<void> {
  const thread = await getCoachThread(s.person, threadId)
  for (const { call } of unresolvedCalls(thread.messages)) {
    const output: StoredOutput = {
      callId: call.id, name: call.name, status: 'rejected', summary: call.summary,
      output: JSON.stringify({ rejected: true, message: 'The person did not confirm this change. Do not assume it happened.' }),
    }
    await appendCoachMessage(s.person, threadId, { role: 'tool', content: output })
  }
}

/** One user message -> a stream of events. Never throws: failures become an `error` event. */
export async function* runCoachTurn(deps: CoachDeps, input: { threadId?: string; message: string; context: CoachContext }): AsyncGenerator<CoachEvent> {
  try {
    const message = input.message.trim()
    if (!message) throw new Error('Write a message first')
    const s = await openSession(deps, input.context)
    let threadId = input.threadId
    if (threadId) {
      await getCoachThread(s.person, threadId)
      await closeDangling(s, threadId)
    } else {
      const t = await createCoachThread(s.person, { title: message.slice(0, 60), context: { ...input.context } })
      threadId = t.id
    }
    yield { type: 'thread', threadId }
    await appendCoachMessage(s.person, threadId, { role: 'user', content: { text: message } })
    yield* loop(s, threadId)
  } catch (e) {
    yield errorEvent(e)
  }
}

/** Approve or reject the proposed changes of `confirmId`, then let the model continue. */
export async function* resolveCoachConfirm(deps: CoachDeps, input: { threadId: string; confirmId: string; approve: boolean; context: CoachContext }): AsyncGenerator<CoachEvent> {
  try {
    const s = await openSession(deps, input.context)
    const thread = await getCoachThread(s.person, input.threadId)
    const pending = unresolvedCalls(thread.messages).filter((p) => p.message.id === input.confirmId && p.call.kind === 'write')
    if (!pending.length) throw Object.assign(new Error('Nothing is waiting for confirmation here (it may already be handled).'), { code: 'nothing_to_confirm' })
    yield { type: 'thread', threadId: input.threadId }
    for (const { call } of pending) {
      if (!input.approve) {
        const output: StoredOutput = {
          callId: call.id, name: call.name, status: 'rejected', summary: call.summary,
          output: JSON.stringify({ rejected: true, message: 'The person declined this change. Do not retry it; briefly acknowledge and ask what they would like instead.' }),
        }
        await appendCoachMessage(s.person, input.threadId, { role: 'tool', content: output })
        continue
      }
      yield { type: 'tool_call', id: call.id, name: call.name, summary: call.summary, status: 'running' }
      const r = await runTool(s, call, true)
      await appendCoachMessage(s.person, input.threadId, { role: 'tool', content: r.output })
      yield { type: 'tool_call', id: call.id, name: call.name, summary: r.output.summary, status: r.ok ? 'done' : 'error' }
    }
    yield* loop(s, input.threadId)
  } catch (e) {
    yield errorEvent(e)
  }
}
