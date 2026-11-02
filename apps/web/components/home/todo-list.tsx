'use client'

import * as React from 'react'
import { Checkbox } from '@motion/ui/checkbox'
import { cn } from '@motion/ui/cn'
import { toast } from '@motion/ui/toaster'
import { setTodoDoneAction } from './actions'

export type HomeTodo = { id: string; title: string; dueLabel: string | null; overdue: boolean; pending: boolean }

/** My open to-dos. Checking completes it optimistically (undo by unchecking). */
export function TodoList({ slug, todos }: { slug: string; todos: HomeTodo[] }) {
  const [done, setDone] = React.useState<Record<string, boolean>>({})
  const [, startTransition] = React.useTransition()

  function toggle(t: HomeTodo, checked: boolean) {
    setDone((d) => ({ ...d, [t.id]: checked }))
    startTransition(async () => {
      const r = await setTodoDoneAction(slug, t.id, checked, globalThis.crypto.randomUUID())
      if (!r.ok) {
        setDone((d) => ({ ...d, [t.id]: !checked }))
        toast.error(r.error)
      } else if (r.message) toast(r.message)
    })
  }

  return (
    <ul className="divide-y divide-line-faint">
      {todos.map((t) => {
        const isDone = done[t.id] ?? false
        return (
          <li key={t.id} className="flex min-h-11 items-center gap-3 py-1.5">
            <Checkbox checked={isDone} onCheckedChange={(c) => toggle(t, c === true)} aria-label={`Complete ${t.title}`} className="size-[18px]" />
            <span className={cn('min-w-0 flex-1 truncate text-base', isDone ? 'text-faint line-through' : 'text-ink')}>{t.title}</span>
            {t.dueLabel && <span className={cn('shrink-0 text-xs tabular-nums', t.overdue && !isDone ? 'font-[550] text-danger-text' : 'text-faint')}>{t.dueLabel}</span>}
          </li>
        )
      })}
    </ul>
  )
}
