import type { AiClientConfig, ExtractedItems } from '@movara/core'
import type { CoachModel, JsonRequest, ModelEvent, ModelItem, ModelRequest } from './types'

export const isMockMode = (env: Record<string, string | undefined> = process.env): boolean => env.MOVARA_AI_MOCK === '1'

/** Config used when mock mode is on and the org has no real AI configuration. */
export const MOCK_CONFIG: AiClientConfig = {
  provider: 'openai', baseUrl: null, apiKey: 'mock', model: 'mock-coach', reasoningEffort: 'low', monthlyTokenLimit: null,
  coachName: 'Coach', coachPersonality: 'Warm, direct and practical.',
}

const tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function* chunks(text: string): Generator<string> {
  const words = text.split(/(\s+)/)
  for (let i = 0; i < words.length; i += 2) yield words.slice(i, i + 2).join('')
}

const lastUser = (items: ModelItem[]) => [...items].reverse().find((i) => i.type === 'message' && i.role === 'user') as Extract<ModelItem, { type: 'message' }> | undefined

/**
 * Deterministic fake model (no network). Behaviour:
 *  - "add a to-do <title>" -> proposes `todo_create` (a confirm card), then acknowledges the outcome
 *  - mentions of priorities / off track / week -> calls `priorities_list` (or `my_week`), then summarises the result
 *  - anything else -> echoes helpfully
 */
export class MockModel implements CoachModel {
  readonly modelName = 'mock-coach'

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const last = req.input[req.input.length - 1]
    const has = (n: string) => req.tools.some((t) => t.name === n)
    let text = ''
    const calls: { name: string; args: unknown }[] = []

    if (last?.type === 'function_call_output') {
      // Summarise the tool results of this step.
      const outs = req.input.slice(req.input.map((i) => i.type).lastIndexOf('message') + 1).filter((i): i is Extract<ModelItem, { type: 'function_call_output' }> => i.type === 'function_call_output')
      const parsed = outs.map((o) => { try { return JSON.parse(o.output) as Record<string, any> } catch { return {} } })
      if (parsed.some((p) => p.rejected)) text = "No problem, I won't make that change."
      else if (parsed.some((p) => p.error)) text = `That did not work: ${parsed.find((p) => p.error)!.error?.message ?? 'unknown error'}`
      else if (parsed.some((p) => p.needsApproval)) text = 'Done. That change was sent for approval.'
      else if (parsed.some((p) => p.ok)) text = 'Done. I made the change you approved; it is now on your list.'
      else {
        const rows = parsed.flatMap((p) => (Array.isArray(p.items) ? p.items : Array.isArray(p.priorities) ? p.priorities : []))
        const off = rows.filter((r: any) => r.status === 'off_track')
        text = rows.length
          ? `I looked at ${rows.length} item${rows.length === 1 ? '' : 's'}. ${off.length ? `${off.length} ${off.length === 1 ? 'is' : 'are'} off track: ${off.slice(0, 3).map((r: any) => r.title).join('; ')}.` : 'Nothing is off track right now.'}`
          : 'I checked your workspace and found nothing to flag.'
      }
    } else {
      const msg = lastUser(req.input)?.content ?? ''
      const m = /add a to-?do[:\s]*(?:to\s+)?(.*)/i.exec(msg)
      if (m && has('todo_create')) {
        const title = (m[1] ?? '').trim().replace(/[.!]+$/, '') || 'Follow up'
        text = `I can add that for you. Please confirm the to-do below.`
        calls.push({ name: 'todo_create', args: { title } })
      } else if (/priorit|off.?track|attention|at risk/i.test(msg) && has('priorities_list')) {
        text = 'Let me look at the priorities.'
        calls.push({ name: 'priorities_list', args: {} })
      } else if (/my week|this week/i.test(msg) && has('my_week')) {
        text = 'Let me check your week.'
        calls.push({ name: 'my_week', args: {} })
      } else if (/VISION INTERVIEW/.test(req.instructions)) {
        text = "Let's build this section by section. First, **core values**: what are the 3 to 5 beliefs your best people already live by, even when it costs you something?"
      } else {
        const topic = msg.length > 140 ? `${msg.slice(0, 140)}...` : msg
        text = `You asked: "${topic}". I'm running in mock mode, so this is a canned reply. With a real model I would use your workspace data to answer.`
      }
    }

    for (const c of chunks(text)) {
      yield { type: 'text', delta: c }
      await sleep(12)
    }
    let n = 0
    for (const c of calls) yield { type: 'tool_call', callId: `mock_${Date.now().toString(36)}_${n++}`, name: c.name, arguments: JSON.stringify(c.args) }
    const inTok = tokens(req.instructions) + req.input.reduce((s, i) => s + tokens(JSON.stringify(i)), 0)
    yield { type: 'done', usage: { inputTokens: inTok, outputTokens: tokens(text) + calls.length * 12 } }
  }

  async json(_req: JsonRequest) {
    return { value: {}, usage: { inputTokens: 1, outputTokens: 1 } }
  }
}

/** Mock extraction: lines starting with "- [ ]" or "TODO:" become to-dos. */
export function mockExtract(notes: string, transcript?: string): ExtractedItems {
  const todos: ExtractedItems['todos'] = []
  for (const raw of `${notes}\n${transcript ?? ''}`.split(/\r?\n/)) {
    const line = raw.trim()
    const m = /^(?:[-*]\s*\[ \]\s*|TODO:\s*)(.+)$/i.exec(line)
    if (m?.[1]?.trim()) todos.push({ title: m[1].trim().slice(0, 300) })
  }
  return { todos, issues: [], headlines: [], decisions: [] }
}
