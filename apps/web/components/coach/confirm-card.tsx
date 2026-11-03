'use client'

import { Check, X } from 'lucide-react'
import type { UiMessage } from '@movara/coach'
import { Button } from '@movara/ui/button'
import { cn } from '@movara/ui/cn'

type Confirm = NonNullable<UiMessage['confirm']>

const show = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(show).join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v))

/** One card for everything Coach wants to change in a step: the person approves or cancels it as a whole. */
export function ConfirmCard({ confirm, disabled, coachName, onDecide }: { confirm: Confirm; disabled: boolean; coachName: string; onDecide: (approve: boolean) => void }) {
  const pending = confirm.status === 'pending'
  const n = confirm.actions.length
  return (
    <div
      data-testid="coach-confirm"
      data-status={confirm.status}
      className={cn('rounded-xl bg-surface shadow-[0_0_0_1px_var(--m-line)]', pending && 'shadow-[0_0_0_1px_var(--accent)]')}
    >
      <div className="flex items-center gap-2 border-b border-line-faint px-3 py-2 text-xs font-[600] text-body">
        {confirm.status === 'approved' ? <Check size={13} className="text-success" /> : confirm.status === 'rejected' ? <X size={13} className="text-faint" /> : null}
        {pending ? `${coachName} wants to make ${n === 1 ? 'this change' : `${n} changes`}` : confirm.status === 'approved' ? 'Approved' : 'Cancelled'}
      </div>
      <ul className="divide-y divide-line-faint">
        {confirm.actions.map((a, i) => {
          const fields = Object.entries((a.input ?? {}) as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '')
          return (
            <li key={i} className="px-3 py-2">
              <div className={cn('text-sm font-[550] text-ink', confirm.status === 'rejected' && 'text-faint line-through')}>{a.summary}</div>
              {fields.length > 0 && (
                <details className="group mt-1">
                  <summary className="cursor-pointer select-none text-xs text-faint outline-none hover:text-body focus-visible:text-ink">Details</summary>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {fields.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-faint">{k}</dt>
                        <dd className="min-w-0 break-words text-body">{show(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          )
        })}
      </ul>
      {pending && (
        <div className="flex justify-end gap-2 border-t border-line-faint px-3 py-2">
          <Button size="sm" disabled={disabled} onClick={() => onDecide(false)} data-testid="coach-cancel">Cancel</Button>
          <Button size="sm" variant="primary" disabled={disabled} onClick={() => onDecide(true)} data-testid="coach-approve">Approve</Button>
        </div>
      )}
    </div>
  )
}
