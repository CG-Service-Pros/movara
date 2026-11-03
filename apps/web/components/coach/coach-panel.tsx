'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowUp, Check, History, Loader2, Plus, Settings2, Square, X } from 'lucide-react'
import type { CoachContext, CoachMode, UiMessage } from '@movara/coach'
import { AgentMark } from '@movara/ui/agent-mark'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'
import { Kbd } from '@movara/ui/kbd'
import { Tip } from '@movara/ui/tooltip'
import { useCoach } from './coach-provider'
import { ConfirmCard } from './confirm-card'
import { Markdown } from './markdown'
import { useCoachChat, type ThreadSummary } from './use-coach-chat'
import { useOnChange } from '@/lib/use-on-change'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MODE_LABEL: Record<CoachMode, string> = { chat: '', meeting: 'Meeting', vision: 'Vision interview', planning: 'Planning' }

type Suggestion = { text: string; mode?: CoachMode }

function suggestionsFor(path: string, l: ReturnType<typeof useCoach>['labels']): Suggestion[] {
  const rest = path.split('/').filter(Boolean).slice(1)
  const area = rest[0] ?? ''
  if (!area) return [{ text: "What's off track this week?" }, { text: 'What should I focus on today?' }]
  if (area === 'priorities') return [{ text: `Help me write a good ${l.priority}` }, { text: `Which ${l.priorities} are at risk?` }]
  if (area === 'scorecard') return [{ text: `Which ${l.metrics} need attention?` }, { text: `Summarize the ${l.metrics} that are off track` }]
  if (area === 'issues') return [{ text: `Which ${l.issues} should we tackle first?` }, { text: `Help me IDS an ${l.issues.replace(/s$/, '')}` }]
  if (area === 'todos') return [{ text: 'What is overdue, and what should I do first?' }]
  if (area === 'meetings' && rest[1] && new RegExp(`^${UUID}$`, 'i').test(rest[1])) return [{ text: 'Prep me for this meeting' }, { text: "What's off track going into this meeting?" }]
  if (area === 'meetings') return [{ text: 'Prep me for my next meeting' }]
  if (area === 'vision') return [{ text: 'Build my vision plan with me', mode: 'vision' }, { text: 'Where is my vision plan weakest?' }]
  return [{ text: "What's off track this week?" }]
}

/** The right-hand Coach panel: docked beside the page on desktop, full screen on mobile. */
export function CoachPanel() {
  const { org, coachName, ready, canConfigure, labels, open, setOpen, request, note } = useCoach()
  const pathname = usePathname()
  const router = useRouter()
  const [modeOverride, setModeOverride] = useState<CoachMode | null>(null)
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const handled = useRef(0)

  const chat = useCoachChat(org, useCallback(() => router.refresh(), [router]))

  const entity = useMemo(() => {
    const m = new RegExp(`/meetings/(${UUID})`, 'i').exec(pathname)
    return m ? { entityType: 'meeting', entityId: m[1]! } : {}
  }, [pathname])
  const mode: CoachMode = modeOverride ?? (entity.entityType === 'meeting' ? 'meeting' : 'chat')
  const contextFor = useCallback(
    (m: CoachMode = mode): CoachContext => ({ path: pathname, ...entity, mode: m, ...(note ? { note } : {}) }),
    [pathname, entity, mode, note],
  )

  // Leaving the page ends a special mode (the conversation itself stays).
  useOnChange(pathname, () => setModeOverride(null))

  // Requests from elsewhere in the app ("Build with Coach", meeting strips).
  useEffect(() => {
    if (!request || request.nonce === handled.current) return
    handled.current = request.nonce
    setView('chat')
    if (request.fresh) chat.reset()
    setModeOverride(request.mode ?? null)
    if (request.prompt) void chat.send(request.prompt, contextFor(request.mode ?? mode))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  useEffect(() => {
    if (open && view === 'chat') requestAnimationFrame(() => input.current?.focus())
  }, [open, view])

  // Sticky once the server says no model is configured.
  if (chat.error?.code === 'not_configured' && !notConfigured) setNotConfigured(true)

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat.messages, chat.busy, view])

  const submit = (text = draft) => {
    if (!text.trim() || chat.busy) return
    setDraft('')
    stick.current = true
    void chat.send(text, contextFor())
  }

  const showHistory = async () => {
    setView(view === 'history' ? 'chat' : 'history')
    if (view === 'chat') {
      const r = await fetch(`/api/coach/threads?org=${encodeURIComponent(org)}`, { cache: 'no-store' })
      if (r.ok) setThreads((await r.json()).threads)
    }
  }

  const empty = chat.messages.length === 0
  const suggestions = suggestionsFor(pathname, labels)
  const setup = !ready || notConfigured

  return (
    <aside
      aria-label={`${coachName} panel`}
      aria-hidden={!open}
      hidden={!open}
      data-testid="coach-panel"
      onKeyDown={(e) => e.key === 'Escape' && !e.defaultPrevented && setOpen(false)}
      className="z-40 flex min-h-0 w-[392px] shrink-0 flex-col overflow-hidden bg-surface shadow-panel max-md:fixed max-md:inset-0 max-md:w-full md:mr-2 md:mt-2 md:rounded-t-[10px]"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <AgentMark size={22} aria-label={coachName} />
        <h2 className="truncate text-base font-[620] text-ink">{coachName}</h2>
        {MODE_LABEL[mode] && <span className="rounded-full bg-canvas px-2 py-0.5 text-2xs font-[600] text-body">{MODE_LABEL[mode]}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label="New conversation"><Button size="icon" variant="ghost" aria-label="New conversation" onClick={() => { chat.reset(); setView('chat'); setModeOverride(null) }}><Plus size={15} strokeWidth={1.7} /></Button></Tip>
          <Tip label="History"><Button size="icon" variant="ghost" aria-label="History" aria-pressed={view === 'history'} onClick={showHistory}><History size={15} strokeWidth={1.7} /></Button></Tip>
          <Tip label="Close"><Button size="icon" variant="ghost" aria-label="Close Coach" onClick={() => setOpen(false)}><X size={15} strokeWidth={1.7} /></Button></Tip>
        </div>
      </header>

      {view === 'history' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {threads === null ? (
            <p className="p-3 text-sm text-faint">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="p-3 text-sm text-faint">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={async () => { await chat.load(t.id); setView('chat') }}
                className={cn('flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left outline-none hover:bg-nav-active focus-visible:ring-2 focus-visible:ring-accent', chat.threadId === t.id && 'bg-nav-active')}
              >
                <span className="truncate text-sm font-[550] text-ink">{t.title}</span>
                <span className="text-xs text-faint">{new Date(t.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </button>
            ))
          )}
        </div>
      ) : setup ? (
        <NotSet org={org} name={coachName} canConfigure={canConfigure} />
      ) : (
        <>
          <div
            ref={scroller}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
            data-testid="coach-messages"
          >
            {empty ? (
              <div className="flex h-full flex-col justify-end gap-3 pb-2">
                <div className="flex flex-col gap-1.5">
                  <AgentMark size={32} aria-label={coachName} />
                  <p className="mt-1 text-lg font-[640] tracking-tight text-ink">Ask {coachName}</p>
                  <p className="text-sm text-body">It reads your workspace, answers with what it finds, and asks before it changes anything.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => {
                        if (s.mode) {
                          setModeOverride(s.mode)
                          void chat.send(s.text, contextFor(s.mode))
                        } else submit(s.text)
                      }}
                      className="rounded-lg px-3 py-2 text-left text-sm text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="flex flex-col gap-4">
                {chat.messages.map((m, i) => (
                  <Message key={m.id} m={m} coachName={coachName} streaming={chat.busy && i === chat.messages.length - 1} onConfirm={(id, ok) => void chat.confirm(id, ok, contextFor())} busy={chat.busy} onNavigate={() => window.matchMedia('(max-width: 767px)').matches && setOpen(false)} />
                ))}
                {chat.busy && chat.messages[chat.messages.length - 1]?.role === 'user' && (
                  <li className="flex items-center gap-2 text-sm text-faint"><Loader2 size={13} className="animate-spin" /> {coachName} is thinking…</li>
                )}
              </ol>
            )}
            {chat.error && chat.error.code !== 'not_configured' && (
              <div role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text" data-testid="coach-error">{chat.error.message}</div>
            )}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); submit() }}
            className="shrink-0 border-t border-line p-3"
          >
            <div className="flex items-end gap-2 rounded-lg bg-surface p-1.5 shadow-[0_0_0_1px_var(--m-line)] focus-within:shadow-[0_0_0_2px_var(--accent)]">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
                  else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
                }}
                rows={1}
                placeholder={`Message ${coachName}`}
                aria-label={`Message ${coachName}`}
                suppressHydrationWarning
                className="max-h-32 min-h-7 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-ink outline-none placeholder:text-faint [field-sizing:content]"
              />
              {chat.busy ? (
                <Button size="icon" variant="secondary" aria-label="Stop" onClick={chat.stop}><Square size={12} fill="currentColor" /></Button>
              ) : (
                <Button size="icon" variant="primary" type="submit" aria-label="Send" disabled={!draft.trim()}><ArrowUp size={15} strokeWidth={2} /></Button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between px-0.5 text-xs text-faint">
              <span>Acts with your permissions. Changes need your OK.</span>
              <span className="flex items-center gap-1"><Kbd>⌘J</Kbd></span>
            </div>
          </form>
        </>
      )}
    </aside>
  )
}

function NotSet({ org, name, canConfigure }: { org: string; name: string; canConfigure: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 px-6" data-testid="coach-not-configured">
      <AgentMark size={36} aria-label={name} />
      <h3 className="text-lg font-[640] tracking-tight text-ink">{name} isn&apos;t set up yet</h3>
      <p className="text-sm text-body">
        {canConfigure
          ? `Add your OpenAI API key and ${name} can read your workspace, prep meetings and draft priorities, always asking before it changes anything.`
          : `An admin can add an API key in Settings → Coach to turn ${name} on.`}
      </p>
      {canConfigure && (
        <Button variant="primary" asChild>
          <Link href={`/${org}/settings/coach`}><Settings2 size={14} /> Open Settings → Coach</Link>
        </Button>
      )}
    </div>
  )
}

function Message({ m, coachName, streaming, busy, onConfirm, onNavigate }: { m: UiMessage; coachName: string; streaming: boolean; busy: boolean; onConfirm: (id: string, approve: boolean) => void; onNavigate: () => void }) {
  if (m.role === 'user') {
    return (
      <li className="ml-8 self-end rounded-xl rounded-br-sm bg-nav-active px-3 py-2 text-sm text-ink whitespace-pre-wrap" data-testid="coach-user-message">{m.text}</li>
    )
  }
  return (
    <li className="flex gap-2.5" data-testid="coach-assistant-message">
      <AgentMark size={22} className="mt-0.5" aria-label={coachName} />
      <div className="min-w-0 flex-1 space-y-2">
        {m.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.toolCalls.map((c) => (
              <span
                key={c.id}
                data-testid="coach-tool-chip"
                className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-[550]', c.status === 'error' ? 'bg-danger-soft text-danger-text' : 'bg-canvas text-body')}
              >
                {c.status === 'pending' ? <Loader2 size={11} className="animate-spin" /> : c.status === 'error' ? <X size={11} /> : <Check size={11} />}
                <span className="truncate">{c.summary}</span>
              </span>
            ))}
          </div>
        )}
        {m.text && <Markdown text={m.text} onNavigate={onNavigate} />}
        {streaming && !m.text && !m.confirm && m.toolCalls.every((c) => c.status !== 'pending') && <Loader2 size={13} className="animate-spin text-faint" />}
        {m.confirm && <ConfirmCard confirm={m.confirm} disabled={busy} coachName={coachName} onDecide={(ok) => onConfirm(m.confirm!.confirmId, ok)} />}
      </div>
    </li>
  )
}
