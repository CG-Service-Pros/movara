/** Provider-neutral conversation items. Persisted coach messages are rebuilt into these on every model call (stateless). */
export type ModelItem =
  | { type: 'message'; role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; callId: string; name: string; arguments: string }
  | { type: 'function_call_output'; callId: string; output: string }

export type ToolSpec = {
  name: string
  description: string
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>
  strict: boolean
}

export type Usage = { inputTokens: number; outputTokens: number }

export type ModelRequest = {
  instructions: string
  input: ModelItem[]
  tools: ToolSpec[]
  signal?: AbortSignal
}

export type ModelEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; callId: string; name: string; arguments: string }
  | { type: 'done'; usage: Usage }

export type JsonRequest = {
  instructions: string
  input: string
  schemaName: string
  schema: Record<string, unknown>
  signal?: AbortSignal
}

/** One model provider binding. `modelName` is what gets recorded in usage. */
export interface CoachModel {
  readonly modelName: string
  stream(req: ModelRequest): AsyncIterable<ModelEvent>
  /** Structured output (strict JSON schema). */
  json(req: JsonRequest): Promise<{ value: unknown; usage: Usage }>
}

export type CoachMode = 'chat' | 'meeting' | 'vision' | 'planning'

/** What the person is looking at. Sent by the client with every message. */
export type CoachContext = {
  path: string
  entityType?: string
  entityId?: string
  mode?: CoachMode
  /** Free text from the page (e.g. the live meeting section and focused issue). Untrusted like the user's message. */
  note?: string
}

export type ConfirmAction = { id?: string; tool: string; summary: string; input: unknown }

export type CoachEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error' }
  | { type: 'confirm'; confirmId: string; actions: ConfirmAction[] }
  | { type: 'done'; threadId: string; usage: Usage; pendingConfirm?: boolean }
  | { type: 'error'; code: string; message: string }

/** UI-facing message shape (what GET /api/coach/threads/:id returns). */
export type UiToolCall = { id: string; name: string; summary: string; status: 'done' | 'error' | 'pending' | 'rejected' }
export type UiMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls: UiToolCall[]
  confirm?: { confirmId: string; status: 'pending' | 'approved' | 'rejected'; actions: ConfirmAction[] }
}
