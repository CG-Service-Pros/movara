'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CoachMode } from '@movara/coach'
import { useOnChange } from '@/lib/use-on-change'

export type CoachLabels = { priority: string; priorities: string; metrics: string; issues: string; todos: string; meeting: string; vision: string }

export type OpenCoachOptions = {
  /** Sent right away as the first message. */
  prompt?: string
  mode?: CoachMode
  /** Start a new conversation (default true when a prompt or mode is given). */
  fresh?: boolean
}
export type CoachRequest = OpenCoachOptions & { nonce: number }

type Value = {
  org: string
  coachName: string
  ready: boolean
  canConfigure: boolean
  labels: CoachLabels
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  openCoach: (o?: OpenCoachOptions) => void
  request: CoachRequest | null
  /** What the current page tells Coach about itself (e.g. the live meeting section). */
  note: string | null
  setNote: (n: string | null) => void
  setReady: (v: boolean) => void
}

const Ctx = createContext<Value | null>(null)

export function CoachProvider({ org, coachName, ready: initialReady, canConfigure, labels, children }: { org: string; coachName: string; ready: boolean; canConfigure: boolean; labels: CoachLabels; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(initialReady)
  const [request, setRequest] = useState<CoachRequest | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useOnChange(initialReady, (r) => setReady(r))

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const openCoach = useCallback((o: OpenCoachOptions = {}) => {
    setOpen(true)
    if (o.prompt || o.mode || o.fresh) setRequest({ ...o, fresh: o.fresh ?? true, nonce: Date.now() })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const value = useMemo<Value>(
    () => ({ org, coachName, ready, canConfigure, labels, open, setOpen, toggle, openCoach, request, note, setNote, setReady }),
    [org, coachName, ready, canConfigure, labels, open, toggle, openCoach, request, note],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCoach(): Value {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCoach must be used inside the app shell')
  return v
}

/** Publish what this screen is showing so Coach can use it (cleared on unmount). */
export function useCoachNote(note: string | null) {
  const { setNote } = useCoach()
  useEffect(() => {
    setNote(note)
    return () => setNote(null)
  }, [note, setNote])
}
