'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoachContext, CoachEvent, UiMessage } from '@movara/coach'

export type ChatError = { code: string; message: string } | null
export type ThreadSummary = { id: string; title: string; updatedAt: string }

/** Streaming chat state for the Coach panel: messages, tool chips, confirm cards and the SSE plumbing. */
export function useCoachChat(org: string, onChanged: () => void) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ChatError>(null)
  const abort = useRef<AbortController | null>(null)
  const threadRef = useRef<string | null>(null)
  const wrote = useRef(false)
  /** The next text starts a new paragraph (it follows a tool call or a confirmation). */
  const afterTool = useRef(false)

  const patchLast = useCallback((fn: (m: UiMessage) => UiMessage) => {
    setMessages((all) => {
      const last = all[all.length - 1]
      if (!last || last.role !== 'assistant') return [...all, fn({ id: `a-${all.length}-${Date.now()}`, role: 'assistant', text: '', toolCalls: [] })]
      return [...all.slice(0, -1), fn(last)]
    })
  }, [])

  const handle = useCallback(
    (e: CoachEvent) => {
      if (e.type === 'thread') {
        threadRef.current = e.threadId
        setThreadId(e.threadId)
      } else if (e.type === 'text') {
        const sep = afterTool.current
        afterTool.current = false
        patchLast((m) => ({ ...m, text: m.text + (sep && m.text ? '\n\n' : '') + e.delta }))
      }
      else if (e.type === 'tool_call') {
        afterTool.current = true
        patchLast((m) => {
          if (m.confirm?.actions.some((a) => a.id === e.id)) return m // shown on the confirm card
          const rest = m.toolCalls.filter((c) => c.id !== e.id)
          const prev = m.toolCalls.find((c) => c.id === e.id)
          const status = e.status === 'running' ? 'pending' : e.status
          const next = { id: e.id, name: e.name, summary: e.summary, status } as const
          return { ...m, toolCalls: prev ? m.toolCalls.map((c) => (c.id === e.id ? next : c)) : [...rest, next] }
        })
      } else if (e.type === 'confirm') patchLast((m) => ({ ...m, confirm: { confirmId: e.confirmId, status: 'pending', actions: e.actions } }))
      else if (e.type === 'error') setError({ code: e.code, message: e.message })
    },
    [patchLast],
  )

  const stream = useCallback(
    async (url: string, body: unknown, continuing = false) => {
      afterTool.current = continuing
      setBusy(true)
      setError(null)
      const ac = new AbortController()
      abort.current = ac
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal })
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => null)
          setError({ code: j?.error?.code ?? 'error', message: j?.error?.message ?? 'Coach could not be reached.' })
          return
        }
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let at: number
          while ((at = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, at)
            buf = buf.slice(at + 2)
            const data = frame.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
            if (data) handle(JSON.parse(data) as CoachEvent)
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError({ code: 'error', message: 'The connection to Coach was interrupted.' })
      } finally {
        setBusy(false)
        abort.current = null
        if (wrote.current) {
          wrote.current = false
          onChanged()
        }
      }
    },
    [handle, onChanged],
  )

  const send = useCallback(
    async (text: string, context: CoachContext) => {
      const t = text.trim()
      if (!t || abort.current) return
      setMessages((all) => [...all, { id: `u-${all.length}-${Date.now()}`, role: 'user', text: t, toolCalls: [] }])
      await stream('/api/coach/chat', { org, threadId: threadRef.current ?? undefined, message: t, context })
    },
    [org, stream],
  )

  const confirm = useCallback(
    async (confirmId: string, approve: boolean, context: CoachContext) => {
      if (!threadRef.current || abort.current) return
      wrote.current = approve
      setMessages((all) => all.map((m) => (m.confirm?.confirmId === confirmId ? { ...m, confirm: { ...m.confirm, status: approve ? 'approved' : 'rejected' } } : m)))
      await stream('/api/coach/confirm', { org, threadId: threadRef.current, confirmId, approve, context }, true)
    },
    [org, stream],
  )

  const reset = useCallback(() => {
    abort.current?.abort()
    threadRef.current = null
    setThreadId(null)
    setMessages([])
    setError(null)
    setBusy(false)
  }, [])

  const load = useCallback(
    async (id: string) => {
      reset()
      const r = await fetch(`/api/coach/threads/${id}?org=${encodeURIComponent(org)}`, { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      threadRef.current = id
      setThreadId(id)
      setMessages(j.messages as UiMessage[])
    },
    [org, reset],
  )

  useEffect(() => () => abort.current?.abort(), [])

  return { messages, threadId, busy, error, send, confirm, reset, load, stop: () => abort.current?.abort(), clearError: () => setError(null) }
}
