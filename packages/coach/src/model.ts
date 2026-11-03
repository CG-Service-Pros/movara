import OpenAI from 'openai'
import type { AiClientConfig } from '@movara/core'
import type { CoachModel, JsonRequest, ModelEvent, ModelItem, ModelRequest, Usage } from './types'

/* The OpenAI SDK's request/stream types are huge unions; the payloads below are plain JSON, so a loose alias keeps this readable. */
type Loose = any

const EFFORT_MODELS = /^(o\d|gpt-5)/i

function client(cfg: AiClientConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl ?? undefined, maxRetries: 2, timeout: 120_000 })
}

/** OpenAI: the Responses API (stateless: `store: false`, the full conversation is sent each step). */
export class ResponsesModel implements CoachModel {
  readonly modelName: string
  private openai: OpenAI
  constructor(private cfg: AiClientConfig) {
    this.modelName = cfg.model
    this.openai = client(cfg)
  }

  private effort(): Loose {
    return EFFORT_MODELS.test(this.cfg.model) ? { reasoning: { effort: this.cfg.reasoningEffort } } : {}
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const input: Loose[] = req.input.map((i) =>
      i.type === 'message' ? { role: i.role, content: i.content }
      : i.type === 'function_call' ? { type: 'function_call', call_id: i.callId, name: i.name, arguments: i.arguments }
      : { type: 'function_call_output', call_id: i.callId, output: i.output })
    const params: Loose = {
      model: this.cfg.model, instructions: req.instructions, input, store: false, stream: true, ...this.effort(),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: t.strict })), parallel_tool_calls: true } : {}),
    }
    const events = (await this.openai.responses.create(params, { signal: req.signal })) as unknown as AsyncIterable<Loose>
    let usage: Usage = { inputTokens: 0, outputTokens: 0 }
    for await (const e of events) {
      if (e.type === 'response.output_text.delta') yield { type: 'text', delta: String(e.delta) }
      else if (e.type === 'response.output_item.done' && e.item?.type === 'function_call') {
        yield { type: 'tool_call', callId: e.item.call_id, name: e.item.name, arguments: e.item.arguments ?? '{}' }
      } else if (e.type === 'response.completed' || e.type === 'response.incomplete') {
        usage = { inputTokens: e.response?.usage?.input_tokens ?? 0, outputTokens: e.response?.usage?.output_tokens ?? 0 }
      } else if (e.type === 'response.failed') throw new Error(e.response?.error?.message ?? 'The model request failed')
      else if (e.type === 'error') throw new Error(e.message ?? 'The model request failed')
    }
    yield { type: 'done', usage }
  }

  async json(req: JsonRequest) {
    const r: Loose = await this.openai.responses.create(
      {
        model: this.cfg.model, instructions: req.instructions, input: req.input, store: false, ...this.effort(),
        text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
      } as Loose,
      { signal: req.signal },
    )
    return { value: JSON.parse(r.output_text || '{}'), usage: { inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 } }
  }
}

/** OpenAI-compatible endpoints (OpenRouter, vLLM, ...): Chat Completions, the lowest common denominator. */
export class ChatCompletionsModel implements CoachModel {
  readonly modelName: string
  private openai: OpenAI
  constructor(private cfg: AiClientConfig) {
    this.modelName = cfg.model
    this.openai = client(cfg)
  }

  private messages(instructions: string, items: ModelItem[]): Loose[] {
    const out: Loose[] = [{ role: 'system', content: instructions }]
    for (const i of items) {
      if (i.type === 'message') out.push({ role: i.role, content: i.content })
      else if (i.type === 'function_call') {
        const last = out[out.length - 1]
        const call = { id: i.callId, type: 'function', function: { name: i.name, arguments: i.arguments } }
        if (last?.role === 'assistant' && last.tool_calls) last.tool_calls.push(call)
        else if (last?.role === 'assistant' && out.length > 1 && last.content !== undefined) last.tool_calls = [call]
        else out.push({ role: 'assistant', content: null, tool_calls: [call] })
      } else out.push({ role: 'tool', tool_call_id: i.callId, content: i.output })
    }
    return out
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const params: Loose = {
      model: this.cfg.model, messages: this.messages(req.instructions, req.input), stream: true, stream_options: { include_usage: true },
      ...(EFFORT_MODELS.test(this.cfg.model) ? { reasoning_effort: this.cfg.reasoningEffort } : {}),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters, strict: t.strict } })) } : {}),
    }
    const stream = (await this.openai.chat.completions.create(params, { signal: req.signal })) as unknown as AsyncIterable<Loose>
    const calls = new Map<number, { id: string; name: string; args: string }>()
    let usage: Usage = { inputTokens: 0, outputTokens: 0 }
    for await (const chunk of stream) {
      const d = chunk.choices?.[0]?.delta
      if (d?.content) yield { type: 'text', delta: String(d.content) }
      for (const tc of d?.tool_calls ?? []) {
        const c = calls.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) c.id = tc.id
        if (tc.function?.name) c.name += tc.function.name
        if (tc.function?.arguments) c.args += tc.function.arguments
        calls.set(tc.index, c)
      }
      if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 }
    }
    for (const c of [...calls.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) yield { type: 'tool_call', callId: c.id, name: c.name, arguments: c.args || '{}' }
    yield { type: 'done', usage }
  }

  async json(req: JsonRequest) {
    const r: Loose = await this.openai.chat.completions.create(
      {
        model: this.cfg.model,
        messages: [{ role: 'system', content: req.instructions }, { role: 'user', content: req.input }],
        response_format: { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
      } as Loose,
      { signal: req.signal },
    )
    return { value: JSON.parse(r.choices?.[0]?.message?.content || '{}'), usage: { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 } }
  }
}

export function createModel(cfg: AiClientConfig): CoachModel {
  return cfg.provider === 'openai' ? new ResponsesModel(cfg) : new ChatCompletionsModel(cfg)
}

/** Rough list price for the default model family ($/1M tokens); null for anything else. */
export function estimateCostUsd(model: string, u: Usage): number | null {
  if (!/gpt-5\.6-luna/i.test(model)) return null
  return (u.inputTokens * 0.2 + u.outputTokens * 1.2) / 1_000_000
}
