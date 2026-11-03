import type { CoachMessageRow } from '@movara/core'
import type { ConfirmAction, ModelItem, UiMessage, UiToolCall } from './types'

/** What an assistant message stores in `toolCalls`. */
export type StoredCall = { id: string; name: string; arguments: string; kind: 'read' | 'write' | 'unknown'; summary: string }
/** What a tool message stores in `content`. */
export type StoredOutput = { callId: string; name: string; output: string; status: 'ok' | 'error' | 'rejected'; summary: string }

const asText = (c: unknown): string => (c && typeof c === 'object' && typeof (c as any).text === 'string' ? (c as any).text : typeof c === 'string' ? c : '')
const callsOf = (m: CoachMessageRow): StoredCall[] => (Array.isArray(m.toolCalls) ? (m.toolCalls as StoredCall[]) : [])

/** Rebuild the model conversation from persisted messages. Starts at a user message so tool pairs are never split. */
export function toItems(messages: CoachMessageRow[], max = 60): ModelItem[] {
  let start = Math.max(0, messages.length - max)
  while (start < messages.length && messages[start]!.role !== 'user') start++
  const items: ModelItem[] = []
  for (const m of messages.slice(start)) {
    if (m.role === 'user') items.push({ type: 'message', role: 'user', content: asText(m.content) })
    else if (m.role === 'assistant') {
      const t = asText(m.content)
      if (t) items.push({ type: 'message', role: 'assistant', content: t })
      for (const c of callsOf(m)) items.push({ type: 'function_call', callId: c.id, name: c.name, arguments: c.arguments })
    } else {
      const o = m.content as StoredOutput
      items.push({ type: 'function_call_output', callId: o.callId, output: o.output })
    }
  }
  return items
}

/** Tool calls that have no output yet. */
export function unresolvedCalls(messages: CoachMessageRow[]): { message: CoachMessageRow; call: StoredCall }[] {
  const done = new Set(messages.filter((m) => m.role === 'tool').map((m) => (m.content as StoredOutput).callId))
  return messages.filter((m) => m.role === 'assistant').flatMap((m) => callsOf(m).filter((c) => !done.has(c.id)).map((call) => ({ message: m, call })))
}

const parseArgs = (s: string): unknown => { try { return JSON.parse(s) } catch { return {} } }

export function actionOf(c: StoredCall): ConfirmAction {
  return { id: c.id, tool: c.name, summary: c.summary, input: parseArgs(c.arguments) }
}

/** Persisted messages -> what the panel renders. Consecutive assistant messages (one turn) are merged into one bubble. */
export function threadToUi(messages: CoachMessageRow[]): UiMessage[] {
  const outputs = new Map<string, StoredOutput>()
  for (const m of messages) if (m.role === 'tool') outputs.set((m.content as StoredOutput).callId, m.content as StoredOutput)
  const ui: UiMessage[] = []
  for (const m of messages) {
    if (m.role === 'user') ui.push({ id: m.id, role: 'user', text: asText(m.content), toolCalls: [] })
    else if (m.role === 'assistant') {
      let cur = ui[ui.length - 1]
      if (!cur || cur.role !== 'assistant') {
        cur = { id: m.id, role: 'assistant', text: '', toolCalls: [] }
        ui.push(cur)
      }
      const t = asText(m.content)
      if (t) cur.text = cur.text ? `${cur.text}\n\n${t}` : t
      const writes = callsOf(m).filter((c) => c.kind === 'write')
      for (const c of callsOf(m)) {
        if (c.kind === 'write') continue
        const o = outputs.get(c.id)
        const status: UiToolCall['status'] = !o ? 'pending' : o.status === 'ok' ? 'done' : o.status
        cur.toolCalls.push({ id: c.id, name: c.name, summary: o?.summary || c.summary, status })
      }
      if (writes.length) {
        const outs = writes.map((c) => outputs.get(c.id))
        const status = outs.some((o) => !o) ? 'pending' : outs.every((o) => o!.status === 'rejected') ? 'rejected' : 'approved'
        cur.confirm = { confirmId: m.id, status, actions: writes.map(actionOf) }
      }
    }
  }
  return ui
}
